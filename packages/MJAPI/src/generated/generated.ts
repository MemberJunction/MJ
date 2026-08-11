/********************************************************************************
* ALL ENTITIES - TypeGraphQL Type Class Definition - AUTO GENERATED FILE
* Generated Entities and Resolvers for Server
*
*   >>> DO NOT MODIFY THIS FILE!!!!!!!!!!!!
*   >>> YOUR CHANGES WILL BE OVERWRITTEN
*   >>> THE NEXT TIME THIS FILE IS GENERATED
*
**********************************************************************************/
import { Arg, Ctx, Int, Query, Resolver, Field, Float, ObjectType, FieldResolver, Root, InputType, Mutation,
            PubSub, PubSubEngine, ResolverBase, RunViewByIDInput, RunViewByNameInput, RunDynamicViewInput,
            AppContext, KeyValuePairInput, DeleteOptionsInput, GraphQLTimestamp as Timestamp,
            GetReadOnlyProvider, GetReadWriteProvider, RestoreContextInput } from '@memberjunction/server';
import { Metadata, EntityPermissionType, CompositeKey, UserInfo } from '@memberjunction/core'

import { MaxLength } from 'class-validator';
import * as mj_core_schema_server_object_types from '@memberjunction/server'


import { DogShelterAdopterEntity, DogShelterAdoptionApplicationEntity, DogShelterBreedEntity, BoardGameNightDesignerEntity, DogShelterDogTraitEntity, DogShelterDogEntity, DogShelterFosterPlacementEntity, BoardGameNightGameDesignerEntity, BoardGameNightGameEntity, DogShelterMedicalRecordEntity, BoardGameNightPlaySessionPlayerEntity, BoardGameNightPlaySessionEntity, BoardGameNightPlayerEntity, BoardGameNightPublisherEntity, DogShelterShelterEntity, DogShelterStaffEntity, DogShelterTraitEntity } from 'mj_generatedentities';
    

//****************************************************************************
// ENTITY CLASS for Adopters
//****************************************************************************
@ObjectType({ description: `People who adopt or foster dogs. The same person can appear on adoption applications and on foster placements, which is why Dog and Adopter have two distinct relationships to each other.` })
export class DogShelterAdopter_ {
    @Field({description: `Unique identifier for the adopter.`}) 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Given name of the adopter.`}) 
    @MaxLength(100)
    FirstName: string;
        
    @Field({description: `Family name of the adopter.`}) 
    @MaxLength(100)
    LastName: string;
        
    @Field({description: `PERSISTED computed column: FirstName plus a space plus LastName. Read-only display value.`}) 
    @MaxLength(201)
    FullName: string;
        
    @Field({description: `Primary email address. Unique - the shelter uses it to detect repeat applicants.`}) 
    @MaxLength(255)
    Email: string;
        
    @Field({nullable: true, description: `Contact phone number for the adopter.`}) 
    @MaxLength(50)
    Phone?: string;
        
    @Field({nullable: true, description: `Home street address, used for home visits.`}) 
    @MaxLength(200)
    AddressLine1?: string;
        
    @Field({nullable: true, description: `City of the adopter home address.`}) 
    @MaxLength(100)
    City?: string;
        
    @Field({nullable: true, description: `State or province of the adopter home address.`}) 
    @MaxLength(50)
    State?: string;
        
    @Field({nullable: true, description: `Postal or ZIP code of the adopter home address.`}) 
    @MaxLength(20)
    PostalCode?: string;
        
    @Field({description: `Type of home. One of: House, Apartment, Condo, Townhouse, Farm. Combined with HasFencedYard when matching high-energy dogs.`}) 
    @MaxLength(20)
    HousingType: string;
        
    @Field(() => Boolean, {description: `Whether the property has a securely fenced yard. Required for some dogs.`}) 
    HasFencedYard: boolean;
        
    @Field(() => Boolean, {description: `Whether the household already has other pets. Relevant to dogs flagged GoodWithDogs or GoodWithCats = 0.`}) 
    HasOtherPets: boolean;
        
    @Field(() => Int, {description: `Number of adults living in the household.`}) 
    HouseholdAdults: number;
        
    @Field(() => Int, {description: `Number of children living in the household. Relevant to dogs flagged GoodWithKids = 0.`}) 
    HouseholdChildren: number;
        
    @Field(() => Boolean, {description: `Whether this person has completed foster training and may take foster placements.`}) 
    IsFosterApproved: boolean;
        
    @Field({description: `Date the person first registered with the shelter.`}) 
    DateRegistered: Date;
        
    @Field({nullable: true, description: `Free-form staff notes about the adopter.`}) 
    Notes?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => Float, {nullable: true}) 
    _mj__Latitude?: number;
        
    @Field(() => Float, {nullable: true}) 
    _mj__Longitude?: number;
        
    @Field(() => [DogShelterFosterPlacement_])
    DogShelterFosterPlacements_FosterAdopterIDArray: DogShelterFosterPlacement_[]; // Link to DogShelterFosterPlacements
    
    @Field(() => [DogShelterAdoptionApplication_])
    DogShelterAdoptionApplications_AdopterIDArray: DogShelterAdoptionApplication_[]; // Link to DogShelterAdoptionApplications
    
}

//****************************************************************************
// INPUT TYPE for Adopters
//****************************************************************************
@InputType()
export class CreateDogShelterAdopterInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    Email?: string;

    @Field({ nullable: true })
    Phone: string | null;

    @Field({ nullable: true })
    AddressLine1: string | null;

    @Field({ nullable: true })
    City: string | null;

    @Field({ nullable: true })
    State: string | null;

    @Field({ nullable: true })
    PostalCode: string | null;

    @Field({ nullable: true })
    HousingType?: string;

    @Field(() => Boolean, { nullable: true })
    HasFencedYard?: boolean;

    @Field(() => Boolean, { nullable: true })
    HasOtherPets?: boolean;

    @Field(() => Int, { nullable: true })
    HouseholdAdults?: number;

    @Field(() => Int, { nullable: true })
    HouseholdChildren?: number;

    @Field(() => Boolean, { nullable: true })
    IsFosterApproved?: boolean;

    @Field({ nullable: true })
    DateRegistered?: Date;

    @Field({ nullable: true })
    Notes: string | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Adopters
//****************************************************************************
@InputType()
export class UpdateDogShelterAdopterInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    Email?: string;

    @Field({ nullable: true })
    Phone?: string | null;

    @Field({ nullable: true })
    AddressLine1?: string | null;

    @Field({ nullable: true })
    City?: string | null;

    @Field({ nullable: true })
    State?: string | null;

    @Field({ nullable: true })
    PostalCode?: string | null;

    @Field({ nullable: true })
    HousingType?: string;

    @Field(() => Boolean, { nullable: true })
    HasFencedYard?: boolean;

    @Field(() => Boolean, { nullable: true })
    HasOtherPets?: boolean;

    @Field(() => Int, { nullable: true })
    HouseholdAdults?: number;

    @Field(() => Int, { nullable: true })
    HouseholdChildren?: number;

    @Field(() => Boolean, { nullable: true })
    IsFosterApproved?: boolean;

    @Field({ nullable: true })
    DateRegistered?: Date;

    @Field({ nullable: true })
    Notes?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Adopters
//****************************************************************************
@ObjectType()
export class RunDogShelterAdopterViewResult {
    @Field(() => [DogShelterAdopter_])
    Results: DogShelterAdopter_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

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

@Resolver(DogShelterAdopter_)
export class DogShelterAdopterResolver extends ResolverBase {
    @Query(() => RunDogShelterAdopterViewResult)
    async RunDogShelterAdopterViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunDogShelterAdopterViewResult)
    async RunDogShelterAdopterViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunDogShelterAdopterViewResult)
    async RunDogShelterAdopterDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Adopters';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => DogShelterAdopter_, { nullable: true })
    async DogShelterAdopter(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<DogShelterAdopter_ | null> {
        this.CheckUserReadPermissions('Adopters', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('DogShelter', 'vwAdopters')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Adopters', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Adopters', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [DogShelterFosterPlacement_])
    async DogShelterFosterPlacements_FosterAdopterIDArray(@Root() dogshelteradopter_: DogShelterAdopter_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Foster Placements', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('DogShelter', 'vwFosterPlacements')} WHERE ${provider.QuoteIdentifier('FosterAdopterID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Foster Placements', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [dogshelteradopter_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Foster Placements', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [DogShelterAdoptionApplication_])
    async DogShelterAdoptionApplications_AdopterIDArray(@Root() dogshelteradopter_: DogShelterAdopter_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Adoption Applications', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('DogShelter', 'vwAdoptionApplications')} WHERE ${provider.QuoteIdentifier('AdopterID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Adoption Applications', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [dogshelteradopter_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Adoption Applications', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => DogShelterAdopter_)
    async CreateDogShelterAdopter(
        @Arg('input', () => CreateDogShelterAdopterInput) input: CreateDogShelterAdopterInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Adopters', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => DogShelterAdopter_)
    async UpdateDogShelterAdopter(
        @Arg('input', () => UpdateDogShelterAdopterInput) input: UpdateDogShelterAdopterInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Adopters', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => DogShelterAdopter_)
    async DeleteDogShelterAdopter(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Adopters', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Adoption Applications
//****************************************************************************
@ObjectType({ description: `An application by one adopter to adopt one dog, with the review workflow attached. This is the FIRST of two many-to-many relationships between Dog and Adopter; the other is FosterPlacement.` })
export class DogShelterAdoptionApplication_ {
    @Field({description: `Unique identifier for the application.`}) 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `The dog being applied for. A dog can receive several competing applications.`}) 
    @MaxLength(36)
    DogID: string;
        
    @Field({description: `The person applying.`}) 
    @MaxLength(36)
    AdopterID: string;
        
    @Field({description: `When the application was submitted.`}) 
    SubmittedAt: Date;
        
    @Field({description: `Workflow state. One of: Submitted, Under Review, Approved, Denied, Withdrawn, Completed. Completed means the adoption actually happened and AdoptionDate is set.`}) 
    @MaxLength(30)
    Status: string;
        
    @Field({nullable: true, description: `The staff member who reviewed the application, normally an Adoption Counselor. NULL while the application is still unreviewed.`}) 
    @MaxLength(36)
    ReviewedByStaffID?: string;
        
    @Field({nullable: true, description: `When the review decision was recorded.`}) 
    ReviewedAt?: Date;
        
    @Field({nullable: true, description: `Date of the in-home visit, where the process requires one.`}) 
    HomeVisitDate?: Date;
        
    @Field({nullable: true, description: `Staff rationale for the approval or denial.`}) 
    DecisionNotes?: string;
        
    @Field({nullable: true, description: `Date the adoption was finalized. Set only on Completed applications and matches the OutcomeDate on the dog.`}) 
    AdoptionDate?: Date;
        
    @Field(() => Float, {nullable: true, description: `Adoption fee actually collected, which may differ from the listed fee after a waiver or promotion.`}) 
    FeePaid?: number;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(100)
    Dog: string;
        
}

//****************************************************************************
// INPUT TYPE for Adoption Applications
//****************************************************************************
@InputType()
export class CreateDogShelterAdoptionApplicationInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    DogID?: string;

    @Field({ nullable: true })
    AdopterID?: string;

    @Field({ nullable: true })
    SubmittedAt?: Date;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    ReviewedByStaffID: string | null;

    @Field({ nullable: true })
    ReviewedAt: Date | null;

    @Field({ nullable: true })
    HomeVisitDate: Date | null;

    @Field({ nullable: true })
    DecisionNotes: string | null;

    @Field({ nullable: true })
    AdoptionDate: Date | null;

    @Field(() => Float, { nullable: true })
    FeePaid: number | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Adoption Applications
//****************************************************************************
@InputType()
export class UpdateDogShelterAdoptionApplicationInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    DogID?: string;

    @Field({ nullable: true })
    AdopterID?: string;

    @Field({ nullable: true })
    SubmittedAt?: Date;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    ReviewedByStaffID?: string | null;

    @Field({ nullable: true })
    ReviewedAt?: Date | null;

    @Field({ nullable: true })
    HomeVisitDate?: Date | null;

    @Field({ nullable: true })
    DecisionNotes?: string | null;

    @Field({ nullable: true })
    AdoptionDate?: Date | null;

    @Field(() => Float, { nullable: true })
    FeePaid?: number | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Adoption Applications
//****************************************************************************
@ObjectType()
export class RunDogShelterAdoptionApplicationViewResult {
    @Field(() => [DogShelterAdoptionApplication_])
    Results: DogShelterAdoptionApplication_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

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

@Resolver(DogShelterAdoptionApplication_)
export class DogShelterAdoptionApplicationResolver extends ResolverBase {
    @Query(() => RunDogShelterAdoptionApplicationViewResult)
    async RunDogShelterAdoptionApplicationViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunDogShelterAdoptionApplicationViewResult)
    async RunDogShelterAdoptionApplicationViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunDogShelterAdoptionApplicationViewResult)
    async RunDogShelterAdoptionApplicationDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Adoption Applications';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => DogShelterAdoptionApplication_, { nullable: true })
    async DogShelterAdoptionApplication(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<DogShelterAdoptionApplication_ | null> {
        this.CheckUserReadPermissions('Adoption Applications', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('DogShelter', 'vwAdoptionApplications')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Adoption Applications', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Adoption Applications', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => DogShelterAdoptionApplication_)
    async CreateDogShelterAdoptionApplication(
        @Arg('input', () => CreateDogShelterAdoptionApplicationInput) input: CreateDogShelterAdoptionApplicationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Adoption Applications', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => DogShelterAdoptionApplication_)
    async UpdateDogShelterAdoptionApplication(
        @Arg('input', () => UpdateDogShelterAdoptionApplicationInput) input: UpdateDogShelterAdoptionApplicationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Adoption Applications', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => DogShelterAdoptionApplication_)
    async DeleteDogShelterAdoptionApplication(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Adoption Applications', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Breeds
//****************************************************************************
@ObjectType({ description: `Reference list of dog breeds with typical size, energy, and grooming characteristics. Referenced twice by Dog - once as primary breed and once as secondary breed for mixes.` })
export class DogShelterBreed_ {
    @Field({description: `Unique identifier for the breed.`}) 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Common name of the breed, for example Labrador Retriever. Includes a Mixed Breed entry for dogs of unknown ancestry.`}) 
    @MaxLength(150)
    Name: string;
        
    @Field({description: `Size class of the breed. One of: Toy, Small, Medium, Large, Giant.`}) 
    @MaxLength(20)
    SizeCategory: string;
        
    @Field(() => Int, {nullable: true, description: `Low end of the typical healthy adult weight range, in pounds.`}) 
    TypicalWeightLbsLow?: number;
        
    @Field(() => Int, {nullable: true, description: `High end of the typical healthy adult weight range, in pounds. Always greater than or equal to TypicalWeightLbsLow.`}) 
    TypicalWeightLbsHigh?: number;
        
    @Field({description: `How much daily exercise the breed typically needs. One of: Low, Moderate, High, Very High. Adoption counselors use this to match dogs to households.`}) 
    @MaxLength(20)
    EnergyLevel: string;
        
    @Field({description: `Typical grooming burden for the breed. One of: Minimal, Moderate, High.`}) 
    @MaxLength(20)
    GroomingNeeds: string;
        
    @Field(() => Int, {nullable: true, description: `Typical lifespan of the breed in years.`}) 
    TypicalLifespanYears?: number;
        
    @Field({nullable: true, description: `Narrative description of the breed temperament and typical care needs.`}) 
    @MaxLength(1000)
    Description?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [DogShelterDog_])
    DogShelterDogs_SecondaryBreedIDArray: DogShelterDog_[]; // Link to DogShelterDogs
    
    @Field(() => [DogShelterDog_])
    DogShelterDogs_PrimaryBreedIDArray: DogShelterDog_[]; // Link to DogShelterDogs
    
}

//****************************************************************************
// INPUT TYPE for Breeds
//****************************************************************************
@InputType()
export class CreateDogShelterBreedInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    SizeCategory?: string;

    @Field(() => Int, { nullable: true })
    TypicalWeightLbsLow: number | null;

    @Field(() => Int, { nullable: true })
    TypicalWeightLbsHigh: number | null;

    @Field({ nullable: true })
    EnergyLevel?: string;

    @Field({ nullable: true })
    GroomingNeeds?: string;

    @Field(() => Int, { nullable: true })
    TypicalLifespanYears: number | null;

    @Field({ nullable: true })
    Description: string | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Breeds
//****************************************************************************
@InputType()
export class UpdateDogShelterBreedInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    SizeCategory?: string;

    @Field(() => Int, { nullable: true })
    TypicalWeightLbsLow?: number | null;

    @Field(() => Int, { nullable: true })
    TypicalWeightLbsHigh?: number | null;

    @Field({ nullable: true })
    EnergyLevel?: string;

    @Field({ nullable: true })
    GroomingNeeds?: string;

    @Field(() => Int, { nullable: true })
    TypicalLifespanYears?: number | null;

    @Field({ nullable: true })
    Description?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Breeds
//****************************************************************************
@ObjectType()
export class RunDogShelterBreedViewResult {
    @Field(() => [DogShelterBreed_])
    Results: DogShelterBreed_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

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

@Resolver(DogShelterBreed_)
export class DogShelterBreedResolver extends ResolverBase {
    @Query(() => RunDogShelterBreedViewResult)
    async RunDogShelterBreedViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunDogShelterBreedViewResult)
    async RunDogShelterBreedViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunDogShelterBreedViewResult)
    async RunDogShelterBreedDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Breeds';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => DogShelterBreed_, { nullable: true })
    async DogShelterBreed(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<DogShelterBreed_ | null> {
        this.CheckUserReadPermissions('Breeds', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('DogShelter', 'vwBreeds')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Breeds', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Breeds', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [DogShelterDog_])
    async DogShelterDogs_SecondaryBreedIDArray(@Root() dogshelterbreed_: DogShelterBreed_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Dogs', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('DogShelter', 'vwDogs')} WHERE ${provider.QuoteIdentifier('SecondaryBreedID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Dogs', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [dogshelterbreed_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Dogs', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [DogShelterDog_])
    async DogShelterDogs_PrimaryBreedIDArray(@Root() dogshelterbreed_: DogShelterBreed_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Dogs', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('DogShelter', 'vwDogs')} WHERE ${provider.QuoteIdentifier('PrimaryBreedID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Dogs', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [dogshelterbreed_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Dogs', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => DogShelterBreed_)
    async CreateDogShelterBreed(
        @Arg('input', () => CreateDogShelterBreedInput) input: CreateDogShelterBreedInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Breeds', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => DogShelterBreed_)
    async UpdateDogShelterBreed(
        @Arg('input', () => UpdateDogShelterBreedInput) input: UpdateDogShelterBreedInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Breeds', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => DogShelterBreed_)
    async DeleteDogShelterBreed(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Breeds', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Designers
//****************************************************************************
@ObjectType({ description: `A person who designs board games. Linked to Game through the GameDesigner junction table in a many-to-many relationship.` })
export class BoardGameNightDesigner_ {
    @Field({description: `Unique identifier for this designer.`}) 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Designer given name.`}) 
    @MaxLength(100)
    FirstName: string;
        
    @Field({description: `Designer family name.`}) 
    @MaxLength(100)
    LastName: string;
        
    @Field({nullable: true, description: `Short biography or notable design credits.`}) 
    Bio?: string;
        
    @Field({nullable: true, description: `Designer personal or studio website URL.`}) 
    @MaxLength(500)
    Website?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [BoardGameNightGameDesigner_])
    BoardGameNightGameDesigners_DesignerIDArray: BoardGameNightGameDesigner_[]; // Link to BoardGameNightGameDesigners
    
}

//****************************************************************************
// INPUT TYPE for Designers
//****************************************************************************
@InputType()
export class CreateBoardGameNightDesignerInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    Bio: string | null;

    @Field({ nullable: true })
    Website: string | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Designers
//****************************************************************************
@InputType()
export class UpdateBoardGameNightDesignerInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    Bio?: string | null;

    @Field({ nullable: true })
    Website?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Designers
//****************************************************************************
@ObjectType()
export class RunBoardGameNightDesignerViewResult {
    @Field(() => [BoardGameNightDesigner_])
    Results: BoardGameNightDesigner_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

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

@Resolver(BoardGameNightDesigner_)
export class BoardGameNightDesignerResolver extends ResolverBase {
    @Query(() => RunBoardGameNightDesignerViewResult)
    async RunBoardGameNightDesignerViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunBoardGameNightDesignerViewResult)
    async RunBoardGameNightDesignerViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunBoardGameNightDesignerViewResult)
    async RunBoardGameNightDesignerDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Designers';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => BoardGameNightDesigner_, { nullable: true })
    async BoardGameNightDesigner(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<BoardGameNightDesigner_ | null> {
        this.CheckUserReadPermissions('Designers', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('BoardGameNight', 'vwDesigners')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Designers', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Designers', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [BoardGameNightGameDesigner_])
    async BoardGameNightGameDesigners_DesignerIDArray(@Root() boardgamenightdesigner_: BoardGameNightDesigner_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Game Designers', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('BoardGameNight', 'vwGameDesigners')} WHERE ${provider.QuoteIdentifier('DesignerID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Game Designers', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [boardgamenightdesigner_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Game Designers', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => BoardGameNightDesigner_)
    async CreateBoardGameNightDesigner(
        @Arg('input', () => CreateBoardGameNightDesignerInput) input: CreateBoardGameNightDesignerInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Designers', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => BoardGameNightDesigner_)
    async UpdateBoardGameNightDesigner(
        @Arg('input', () => UpdateBoardGameNightDesignerInput) input: UpdateBoardGameNightDesignerInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Designers', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => BoardGameNightDesigner_)
    async DeleteBoardGameNightDesigner(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Designers', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Dog Traits
//****************************************************************************
@ObjectType({ description: `PURE JUNCTION TABLE joining Dog and Trait. Each row means one dog has been tagged with one trait. The unique constraint on DogID plus TraitID prevents the same tag being applied twice.` })
export class DogShelterDogTrait_ {
    @Field({description: `Unique identifier for the dog-trait assignment.`}) 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `The dog being tagged.`}) 
    @MaxLength(36)
    DogID: string;
        
    @Field({description: `The trait being applied.`}) 
    @MaxLength(36)
    TraitID: string;
        
    @Field({nullable: true, description: `The staff member who observed and recorded the trait.`}) 
    @MaxLength(36)
    AssignedByStaffID?: string;
        
    @Field({description: `When the trait was assigned.`}) 
    AssignedAt: Date;
        
    @Field({nullable: true, description: `Context for the tag, for example the specific situation where the behavior was observed.`}) 
    @MaxLength(500)
    Notes?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(100)
    Dog: string;
        
    @Field() 
    @MaxLength(100)
    Trait: string;
        
}

//****************************************************************************
// INPUT TYPE for Dog Traits
//****************************************************************************
@InputType()
export class CreateDogShelterDogTraitInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    DogID?: string;

    @Field({ nullable: true })
    TraitID?: string;

    @Field({ nullable: true })
    AssignedByStaffID: string | null;

    @Field({ nullable: true })
    AssignedAt?: Date;

    @Field({ nullable: true })
    Notes: string | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Dog Traits
//****************************************************************************
@InputType()
export class UpdateDogShelterDogTraitInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    DogID?: string;

    @Field({ nullable: true })
    TraitID?: string;

    @Field({ nullable: true })
    AssignedByStaffID?: string | null;

    @Field({ nullable: true })
    AssignedAt?: Date;

    @Field({ nullable: true })
    Notes?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Dog Traits
//****************************************************************************
@ObjectType()
export class RunDogShelterDogTraitViewResult {
    @Field(() => [DogShelterDogTrait_])
    Results: DogShelterDogTrait_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

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

@Resolver(DogShelterDogTrait_)
export class DogShelterDogTraitResolver extends ResolverBase {
    @Query(() => RunDogShelterDogTraitViewResult)
    async RunDogShelterDogTraitViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunDogShelterDogTraitViewResult)
    async RunDogShelterDogTraitViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunDogShelterDogTraitViewResult)
    async RunDogShelterDogTraitDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Dog Traits';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => DogShelterDogTrait_, { nullable: true })
    async DogShelterDogTrait(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<DogShelterDogTrait_ | null> {
        this.CheckUserReadPermissions('Dog Traits', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('DogShelter', 'vwDogTraits')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Dog Traits', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Dog Traits', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => DogShelterDogTrait_)
    async CreateDogShelterDogTrait(
        @Arg('input', () => CreateDogShelterDogTraitInput) input: CreateDogShelterDogTraitInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Dog Traits', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => DogShelterDogTrait_)
    async UpdateDogShelterDogTrait(
        @Arg('input', () => UpdateDogShelterDogTraitInput) input: UpdateDogShelterDogTraitInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Dog Traits', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => DogShelterDogTrait_)
    async DeleteDogShelterDogTrait(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Dog Traits', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Dogs
//****************************************************************************
@ObjectType({ description: `The central entity of the shelter. One row per dog in the care of the organization, past or present. A dog stays in this table after adoption - Status and OutcomeDate record what happened rather than the row being deleted.` })
export class DogShelterDog_ {
    @Field({description: `Unique identifier for the dog.`}) 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Name the shelter uses for the dog. Assigned by staff on intake for strays.`}) 
    @MaxLength(100)
    Name: string;
        
    @Field({description: `The shelter location currently responsible for this dog.`}) 
    @MaxLength(36)
    ShelterID: string;
        
    @Field({description: `Best-guess primary breed. One of TWO foreign keys from this table to Breed - see also SecondaryBreedID.`}) 
    @MaxLength(36)
    PrimaryBreedID: string;
        
    @Field({nullable: true, description: `Second breed for a mixed-breed dog, or NULL if the dog appears purebred or the mix is unknown. The SECOND foreign key from this table to Breed. Always different from PrimaryBreedID.`}) 
    @MaxLength(36)
    SecondaryBreedID?: string;
        
    @Field({nullable: true, description: `SELF-REFERENCING foreign key to the mother of this dog, populated only for puppies born in shelter care. NULL for every dog that arrived from outside.`}) 
    @MaxLength(36)
    MotherID?: string;
        
    @Field({description: `Sex of the dog. One of: Male, Female.`}) 
    @MaxLength(10)
    Sex: string;
        
    @Field({nullable: true, description: `Estimated date of birth. For strays this is a veterinary estimate from dentition, not a known date.`}) 
    EstimatedBirthDate?: Date;
        
    @Field(() => Int, {nullable: true, description: `COMPUTED, NOT PERSISTED: whole months between EstimatedBirthDate and today. Read-only and recalculated on every read, so it cannot be indexed.`}) 
    EstimatedAgeMonths?: number;
        
    @Field(() => Float, {nullable: true, description: `Most recent recorded weight in pounds.`}) 
    WeightLbs?: number;
        
    @Field({nullable: true, description: `Coat color and pattern as described by staff, for example Black and White or Brindle.`}) 
    @MaxLength(100)
    Color?: string;
        
    @Field({nullable: true, description: `Implanted microchip number. Unique when present, NULL for dogs not yet chipped.`}) 
    @MaxLength(50)
    MicrochipNumber?: string;
        
    @Field({description: `Date the dog entered the care of the shelter. The clock that length-of-stay is measured from.`}) 
    IntakeDate: Date;
        
    @Field({description: `How the dog arrived. One of: Stray, Owner Surrender, Transfer, Born In Care, Return. Return means a previously adopted dog came back.`}) 
    @MaxLength(30)
    IntakeType: string;
        
    @Field({description: `Current disposition. One of: Intake, Available, Pending, Fostered, Medical Hold, Adopted, Transferred. Only Available dogs are shown to the public; Pending means an approved application is in progress. Adopted and Transferred are terminal and always have an OutcomeDate.`}) 
    @MaxLength(30)
    Status: string;
        
    @Field({nullable: true, description: `Date the dog left the care of the shelter through adoption or transfer. NULL while the dog is still in care. Never earlier than IntakeDate.`}) 
    OutcomeDate?: Date;
        
    @Field(() => Int, {nullable: true, description: `COMPUTED, NOT PERSISTED: days between IntakeDate and OutcomeDate, or between IntakeDate and today for a dog still in care. This is the length-of-stay metric the shelter manages against.`}) 
    DaysInCare?: number;
        
    @Field(() => Boolean, {description: `Whether the dog has been spayed or neutered. Must be 1 before an adoption can be finalized.`}) 
    IsSpayedNeutered: boolean;
        
    @Field(() => Boolean, {description: `Whether the dog is reliably house trained.`}) 
    IsHouseTrained: boolean;
        
    @Field(() => Boolean, {nullable: true, description: `TRI-STATE: 1 = tested and does well with other dogs, 0 = tested and does not, NULL = not yet assessed. NULL is meaningfully different from 0 and must not be treated as a no.`}) 
    GoodWithDogs?: boolean;
        
    @Field(() => Boolean, {nullable: true, description: `TRI-STATE: 1 = tested and does well with cats, 0 = tested and does not, NULL = not yet assessed.`}) 
    GoodWithCats?: boolean;
        
    @Field(() => Boolean, {nullable: true, description: `TRI-STATE: 1 = tested and does well with children, 0 = tested and does not, NULL = not yet assessed.`}) 
    GoodWithKids?: boolean;
        
    @Field(() => Float, {description: `Adoption fee in dollars. Typically lower for large, senior, or long-stay dogs to encourage placement.`}) 
    AdoptionFee: number;
        
    @Field({nullable: true, description: `Public-facing narrative used on the adoption listing.`}) 
    Bio?: string;
        
    @Field({nullable: true, description: `URL of the primary adoption listing photo.`}) 
    @MaxLength(1000)
    PhotoURL?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(200)
    Shelter: string;
        
    @Field() 
    @MaxLength(150)
    PrimaryBreed: string;
        
    @Field({nullable: true}) 
    @MaxLength(150)
    SecondaryBreed?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Mother?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    RootMotherID?: string;
        
    @Field(() => [DogShelterDogTrait_])
    DogShelterDogTraits_DogIDArray: DogShelterDogTrait_[]; // Link to DogShelterDogTraits
    
    @Field(() => [DogShelterAdoptionApplication_])
    DogShelterAdoptionApplications_DogIDArray: DogShelterAdoptionApplication_[]; // Link to DogShelterAdoptionApplications
    
    @Field(() => [DogShelterFosterPlacement_])
    DogShelterFosterPlacements_DogIDArray: DogShelterFosterPlacement_[]; // Link to DogShelterFosterPlacements
    
    @Field(() => [DogShelterDog_])
    DogShelterDogs_MotherIDArray: DogShelterDog_[]; // Link to DogShelterDogs
    
    @Field(() => [DogShelterMedicalRecord_])
    DogShelterMedicalRecords_DogIDArray: DogShelterMedicalRecord_[]; // Link to DogShelterMedicalRecords
    
}

//****************************************************************************
// INPUT TYPE for Dogs
//****************************************************************************
@InputType()
export class CreateDogShelterDogInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    ShelterID?: string;

    @Field({ nullable: true })
    PrimaryBreedID?: string;

    @Field({ nullable: true })
    SecondaryBreedID: string | null;

    @Field({ nullable: true })
    MotherID: string | null;

    @Field({ nullable: true })
    Sex?: string;

    @Field({ nullable: true })
    EstimatedBirthDate: Date | null;

    @Field(() => Float, { nullable: true })
    WeightLbs: number | null;

    @Field({ nullable: true })
    Color: string | null;

    @Field({ nullable: true })
    MicrochipNumber: string | null;

    @Field({ nullable: true })
    IntakeDate?: Date;

    @Field({ nullable: true })
    IntakeType?: string;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    OutcomeDate: Date | null;

    @Field(() => Boolean, { nullable: true })
    IsSpayedNeutered?: boolean;

    @Field(() => Boolean, { nullable: true })
    IsHouseTrained?: boolean;

    @Field(() => Boolean, { nullable: true })
    GoodWithDogs: boolean | null;

    @Field(() => Boolean, { nullable: true })
    GoodWithCats: boolean | null;

    @Field(() => Boolean, { nullable: true })
    GoodWithKids: boolean | null;

    @Field(() => Float, { nullable: true })
    AdoptionFee?: number;

    @Field({ nullable: true })
    Bio: string | null;

    @Field({ nullable: true })
    PhotoURL: string | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Dogs
//****************************************************************************
@InputType()
export class UpdateDogShelterDogInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    ShelterID?: string;

    @Field({ nullable: true })
    PrimaryBreedID?: string;

    @Field({ nullable: true })
    SecondaryBreedID?: string | null;

    @Field({ nullable: true })
    MotherID?: string | null;

    @Field({ nullable: true })
    Sex?: string;

    @Field({ nullable: true })
    EstimatedBirthDate?: Date | null;

    @Field(() => Float, { nullable: true })
    WeightLbs?: number | null;

    @Field({ nullable: true })
    Color?: string | null;

    @Field({ nullable: true })
    MicrochipNumber?: string | null;

    @Field({ nullable: true })
    IntakeDate?: Date;

    @Field({ nullable: true })
    IntakeType?: string;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    OutcomeDate?: Date | null;

    @Field(() => Boolean, { nullable: true })
    IsSpayedNeutered?: boolean;

    @Field(() => Boolean, { nullable: true })
    IsHouseTrained?: boolean;

    @Field(() => Boolean, { nullable: true })
    GoodWithDogs?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    GoodWithCats?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    GoodWithKids?: boolean | null;

    @Field(() => Float, { nullable: true })
    AdoptionFee?: number;

    @Field({ nullable: true })
    Bio?: string | null;

    @Field({ nullable: true })
    PhotoURL?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Dogs
//****************************************************************************
@ObjectType()
export class RunDogShelterDogViewResult {
    @Field(() => [DogShelterDog_])
    Results: DogShelterDog_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

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

@Resolver(DogShelterDog_)
export class DogShelterDogResolver extends ResolverBase {
    @Query(() => RunDogShelterDogViewResult)
    async RunDogShelterDogViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunDogShelterDogViewResult)
    async RunDogShelterDogViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunDogShelterDogViewResult)
    async RunDogShelterDogDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Dogs';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => DogShelterDog_, { nullable: true })
    async DogShelterDog(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<DogShelterDog_ | null> {
        this.CheckUserReadPermissions('Dogs', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('DogShelter', 'vwDogs')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Dogs', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Dogs', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [DogShelterDogTrait_])
    async DogShelterDogTraits_DogIDArray(@Root() dogshelterdog_: DogShelterDog_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Dog Traits', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('DogShelter', 'vwDogTraits')} WHERE ${provider.QuoteIdentifier('DogID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Dog Traits', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [dogshelterdog_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Dog Traits', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [DogShelterAdoptionApplication_])
    async DogShelterAdoptionApplications_DogIDArray(@Root() dogshelterdog_: DogShelterDog_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Adoption Applications', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('DogShelter', 'vwAdoptionApplications')} WHERE ${provider.QuoteIdentifier('DogID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Adoption Applications', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [dogshelterdog_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Adoption Applications', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [DogShelterFosterPlacement_])
    async DogShelterFosterPlacements_DogIDArray(@Root() dogshelterdog_: DogShelterDog_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Foster Placements', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('DogShelter', 'vwFosterPlacements')} WHERE ${provider.QuoteIdentifier('DogID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Foster Placements', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [dogshelterdog_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Foster Placements', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [DogShelterDog_])
    async DogShelterDogs_MotherIDArray(@Root() dogshelterdog_: DogShelterDog_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Dogs', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('DogShelter', 'vwDogs')} WHERE ${provider.QuoteIdentifier('MotherID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Dogs', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [dogshelterdog_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Dogs', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [DogShelterMedicalRecord_])
    async DogShelterMedicalRecords_DogIDArray(@Root() dogshelterdog_: DogShelterDog_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Medical Records', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('DogShelter', 'vwMedicalRecords')} WHERE ${provider.QuoteIdentifier('DogID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Medical Records', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [dogshelterdog_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Medical Records', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => DogShelterDog_)
    async CreateDogShelterDog(
        @Arg('input', () => CreateDogShelterDogInput) input: CreateDogShelterDogInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Dogs', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => DogShelterDog_)
    async UpdateDogShelterDog(
        @Arg('input', () => UpdateDogShelterDogInput) input: UpdateDogShelterDogInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Dogs', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => DogShelterDog_)
    async DeleteDogShelterDog(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Dogs', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Foster Placements
//****************************************************************************
@ObjectType({ description: `A temporary placement of a dog in a foster home. This is the SECOND many-to-many relationship between Dog and Adopter, which is why each of those entities ends up with two related-record tabs pointing at the other.` })
export class DogShelterFosterPlacement_ {
    @Field({description: `Unique identifier for the foster placement.`}) 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `The dog placed in foster care.`}) 
    @MaxLength(36)
    DogID: string;
        
    @Field({description: `The foster caregiver. Points at Adopter, and that person normally has IsFosterApproved = 1.`}) 
    @MaxLength(36)
    FosterAdopterID: string;
        
    @Field({description: `Date the dog went into the foster home.`}) 
    StartDate: Date;
        
    @Field({nullable: true, description: `Date the placement ended. NULL while the placement is still Active. Never earlier than StartDate.`}) 
    EndDate?: Date;
        
    @Field({description: `State of the placement. One of: Active, Completed, Ended Early. Ended Early means the placement was cut short, usually for a behavioral or medical reason.`}) 
    @MaxLength(20)
    Status: string;
        
    @Field({nullable: true, description: `Why the dog was placed in foster care, for example post-surgery recovery or kennel stress.`}) 
    @MaxLength(200)
    Reason?: string;
        
    @Field({nullable: true, description: `Notes from the foster caregiver about how the dog behaves in a home.`}) 
    Notes?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(100)
    Dog: string;
        
}

//****************************************************************************
// INPUT TYPE for Foster Placements
//****************************************************************************
@InputType()
export class CreateDogShelterFosterPlacementInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    DogID?: string;

    @Field({ nullable: true })
    FosterAdopterID?: string;

    @Field({ nullable: true })
    StartDate?: Date;

    @Field({ nullable: true })
    EndDate: Date | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    Reason: string | null;

    @Field({ nullable: true })
    Notes: string | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Foster Placements
//****************************************************************************
@InputType()
export class UpdateDogShelterFosterPlacementInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    DogID?: string;

    @Field({ nullable: true })
    FosterAdopterID?: string;

    @Field({ nullable: true })
    StartDate?: Date;

    @Field({ nullable: true })
    EndDate?: Date | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    Reason?: string | null;

    @Field({ nullable: true })
    Notes?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Foster Placements
//****************************************************************************
@ObjectType()
export class RunDogShelterFosterPlacementViewResult {
    @Field(() => [DogShelterFosterPlacement_])
    Results: DogShelterFosterPlacement_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

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

@Resolver(DogShelterFosterPlacement_)
export class DogShelterFosterPlacementResolver extends ResolverBase {
    @Query(() => RunDogShelterFosterPlacementViewResult)
    async RunDogShelterFosterPlacementViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunDogShelterFosterPlacementViewResult)
    async RunDogShelterFosterPlacementViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunDogShelterFosterPlacementViewResult)
    async RunDogShelterFosterPlacementDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Foster Placements';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => DogShelterFosterPlacement_, { nullable: true })
    async DogShelterFosterPlacement(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<DogShelterFosterPlacement_ | null> {
        this.CheckUserReadPermissions('Foster Placements', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('DogShelter', 'vwFosterPlacements')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Foster Placements', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Foster Placements', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => DogShelterFosterPlacement_)
    async CreateDogShelterFosterPlacement(
        @Arg('input', () => CreateDogShelterFosterPlacementInput) input: CreateDogShelterFosterPlacementInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Foster Placements', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => DogShelterFosterPlacement_)
    async UpdateDogShelterFosterPlacement(
        @Arg('input', () => UpdateDogShelterFosterPlacementInput) input: UpdateDogShelterFosterPlacementInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Foster Placements', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => DogShelterFosterPlacement_)
    async DeleteDogShelterFosterPlacement(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Foster Placements', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Game Designers
//****************************************************************************
@ObjectType({ description: `Pure junction table linking Games to Designers in a many-to-many relationship. Carries no data of its own -- contrast with PlaySessionPlayer, which does.` })
export class BoardGameNightGameDesigner_ {
    @Field({description: `Unique identifier for this game-designer link.`}) 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Foreign key to the Game.`}) 
    @MaxLength(36)
    GameID: string;
        
    @Field({description: `Foreign key to the Designer.`}) 
    @MaxLength(36)
    DesignerID: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(255)
    Game: string;
        
    @Field() 
    @MaxLength(100)
    Designer: string;
        
}

//****************************************************************************
// INPUT TYPE for Game Designers
//****************************************************************************
@InputType()
export class CreateBoardGameNightGameDesignerInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    GameID?: string;

    @Field({ nullable: true })
    DesignerID?: string;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Game Designers
//****************************************************************************
@InputType()
export class UpdateBoardGameNightGameDesignerInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    GameID?: string;

    @Field({ nullable: true })
    DesignerID?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Game Designers
//****************************************************************************
@ObjectType()
export class RunBoardGameNightGameDesignerViewResult {
    @Field(() => [BoardGameNightGameDesigner_])
    Results: BoardGameNightGameDesigner_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

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

@Resolver(BoardGameNightGameDesigner_)
export class BoardGameNightGameDesignerResolver extends ResolverBase {
    @Query(() => RunBoardGameNightGameDesignerViewResult)
    async RunBoardGameNightGameDesignerViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunBoardGameNightGameDesignerViewResult)
    async RunBoardGameNightGameDesignerViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunBoardGameNightGameDesignerViewResult)
    async RunBoardGameNightGameDesignerDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Game Designers';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => BoardGameNightGameDesigner_, { nullable: true })
    async BoardGameNightGameDesigner(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<BoardGameNightGameDesigner_ | null> {
        this.CheckUserReadPermissions('Game Designers', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('BoardGameNight', 'vwGameDesigners')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Game Designers', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Game Designers', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => BoardGameNightGameDesigner_)
    async CreateBoardGameNightGameDesigner(
        @Arg('input', () => CreateBoardGameNightGameDesignerInput) input: CreateBoardGameNightGameDesignerInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Game Designers', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => BoardGameNightGameDesigner_)
    async UpdateBoardGameNightGameDesigner(
        @Arg('input', () => UpdateBoardGameNightGameDesignerInput) input: UpdateBoardGameNightGameDesignerInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Game Designers', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => BoardGameNightGameDesigner_)
    async DeleteBoardGameNightGameDesigner(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Game Designers', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Games
//****************************************************************************
@ObjectType({ description: `A board game in the collection, on the wishlist, or previously owned. Belongs to one Publisher, has many Designers through GameDesigner, and is played across many PlaySessions.` })
export class BoardGameNightGame_ {
    @Field({description: `Unique identifier for this game.`}) 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Game title as printed on the box.`}) 
    @MaxLength(255)
    Name: string;
        
    @Field({description: `Foreign key to the Publisher that released this edition.`}) 
    @MaxLength(36)
    PublisherID: string;
        
    @Field(() => Int, {nullable: true, description: `Year of first publication.`}) 
    YearPublished?: number;
        
    @Field(() => Int, {description: `Minimum number of players supported by the rules.`}) 
    MinPlayers: number;
        
    @Field(() => Int, {description: `Maximum number of players supported by the rules.`}) 
    MaxPlayers: number;
        
    @Field(() => Int, {nullable: true, description: `Publisher-stated minimum play time in minutes.`}) 
    MinPlayTimeMinutes?: number;
        
    @Field(() => Int, {nullable: true, description: `Publisher-stated maximum play time in minutes. Compare against PlaySession.DurationMinutes to see how badly the box lies.`}) 
    MaxPlayTimeMinutes?: number;
        
    @Field(() => Float, {nullable: true, description: `Complexity rating from 1.00 (lightest) to 5.00 (heaviest), BoardGameGeek style. Enforced by a range CHECK, not a value list.`}) 
    Weight?: number;
        
    @Field({description: `Primary game category. Constrained to a fixed list, which CodeGen turns into a dropdown.`}) 
    @MaxLength(50)
    Category: string;
        
    @Field({description: `Current ownership state of this title. Constrained to a fixed list, which CodeGen turns into a dropdown.`}) 
    @MaxLength(30)
    OwnershipStatus: string;
        
    @Field({nullable: true, description: `Date the copy was acquired. Null for wishlist titles.`}) 
    AcquiredDate?: Date;
        
    @Field(() => Float, {nullable: true, description: `Purchase price paid, in USD. Null for wishlist titles or gifts.`}) 
    PurchasePrice?: number;
        
    @Field({nullable: true, description: `Free-form notes about this copy: expansions owned, house rules, condition.`}) 
    Notes?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(200)
    Publisher: string;
        
    @Field(() => [BoardGameNightGameDesigner_])
    BoardGameNightGameDesigners_GameIDArray: BoardGameNightGameDesigner_[]; // Link to BoardGameNightGameDesigners
    
    @Field(() => [BoardGameNightPlaySession_])
    BoardGameNightPlaySessions_GameIDArray: BoardGameNightPlaySession_[]; // Link to BoardGameNightPlaySessions
    
}

//****************************************************************************
// INPUT TYPE for Games
//****************************************************************************
@InputType()
export class CreateBoardGameNightGameInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    PublisherID?: string;

    @Field(() => Int, { nullable: true })
    YearPublished: number | null;

    @Field(() => Int, { nullable: true })
    MinPlayers?: number;

    @Field(() => Int, { nullable: true })
    MaxPlayers?: number;

    @Field(() => Int, { nullable: true })
    MinPlayTimeMinutes: number | null;

    @Field(() => Int, { nullable: true })
    MaxPlayTimeMinutes: number | null;

    @Field(() => Float, { nullable: true })
    Weight: number | null;

    @Field({ nullable: true })
    Category?: string;

    @Field({ nullable: true })
    OwnershipStatus?: string;

    @Field({ nullable: true })
    AcquiredDate: Date | null;

    @Field(() => Float, { nullable: true })
    PurchasePrice: number | null;

    @Field({ nullable: true })
    Notes: string | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Games
//****************************************************************************
@InputType()
export class UpdateBoardGameNightGameInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    PublisherID?: string;

    @Field(() => Int, { nullable: true })
    YearPublished?: number | null;

    @Field(() => Int, { nullable: true })
    MinPlayers?: number;

    @Field(() => Int, { nullable: true })
    MaxPlayers?: number;

    @Field(() => Int, { nullable: true })
    MinPlayTimeMinutes?: number | null;

    @Field(() => Int, { nullable: true })
    MaxPlayTimeMinutes?: number | null;

    @Field(() => Float, { nullable: true })
    Weight?: number | null;

    @Field({ nullable: true })
    Category?: string;

    @Field({ nullable: true })
    OwnershipStatus?: string;

    @Field({ nullable: true })
    AcquiredDate?: Date | null;

    @Field(() => Float, { nullable: true })
    PurchasePrice?: number | null;

    @Field({ nullable: true })
    Notes?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Games
//****************************************************************************
@ObjectType()
export class RunBoardGameNightGameViewResult {
    @Field(() => [BoardGameNightGame_])
    Results: BoardGameNightGame_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

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

@Resolver(BoardGameNightGame_)
export class BoardGameNightGameResolver extends ResolverBase {
    @Query(() => RunBoardGameNightGameViewResult)
    async RunBoardGameNightGameViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunBoardGameNightGameViewResult)
    async RunBoardGameNightGameViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunBoardGameNightGameViewResult)
    async RunBoardGameNightGameDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Games';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => BoardGameNightGame_, { nullable: true })
    async BoardGameNightGame(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<BoardGameNightGame_ | null> {
        this.CheckUserReadPermissions('Games', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('BoardGameNight', 'vwGames')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Games', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Games', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [BoardGameNightGameDesigner_])
    async BoardGameNightGameDesigners_GameIDArray(@Root() boardgamenightgame_: BoardGameNightGame_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Game Designers', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('BoardGameNight', 'vwGameDesigners')} WHERE ${provider.QuoteIdentifier('GameID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Game Designers', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [boardgamenightgame_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Game Designers', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [BoardGameNightPlaySession_])
    async BoardGameNightPlaySessions_GameIDArray(@Root() boardgamenightgame_: BoardGameNightGame_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Play Sessions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('BoardGameNight', 'vwPlaySessions')} WHERE ${provider.QuoteIdentifier('GameID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Play Sessions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [boardgamenightgame_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Play Sessions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => BoardGameNightGame_)
    async CreateBoardGameNightGame(
        @Arg('input', () => CreateBoardGameNightGameInput) input: CreateBoardGameNightGameInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Games', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => BoardGameNightGame_)
    async UpdateBoardGameNightGame(
        @Arg('input', () => UpdateBoardGameNightGameInput) input: UpdateBoardGameNightGameInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Games', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => BoardGameNightGame_)
    async DeleteBoardGameNightGame(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Games', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Medical Records
//****************************************************************************
@ObjectType({ description: `One entry in the medical history of a dog. Many rows per dog, forming a timeline from intake exam through vaccinations and any surgery.` })
export class DogShelterMedicalRecord_ {
    @Field({description: `Unique identifier for the medical record entry.`}) 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `The dog this record belongs to.`}) 
    @MaxLength(36)
    DogID: string;
        
    @Field({description: `Date the procedure or observation took place.`}) 
    RecordDate: Date;
        
    @Field({description: `Kind of medical event. One of: Vaccination, Exam, Surgery, Treatment, Test, Dental.`}) 
    @MaxLength(30)
    RecordType: string;
        
    @Field({description: `Short description of what was done, for example DHPP booster or dental cleaning with two extractions.`}) 
    @MaxLength(500)
    Description: string;
        
    @Field({nullable: true, description: `The Veterinarian or Vet Tech who performed the work. NULL for records entered from an outside clinic.`}) 
    @MaxLength(36)
    VeterinarianStaffID?: string;
        
    @Field(() => Float, {description: `Cost of the procedure in dollars. Summed per dog to understand the true cost of care.`}) 
    Cost: number;
        
    @Field({nullable: true, description: `Date a follow-up is due, for example the next booster. NULL when no follow-up is needed.`}) 
    FollowUpDate?: Date;
        
    @Field({nullable: true, description: `Additional clinical notes.`}) 
    Notes?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(100)
    Dog: string;
        
}

//****************************************************************************
// INPUT TYPE for Medical Records
//****************************************************************************
@InputType()
export class CreateDogShelterMedicalRecordInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    DogID?: string;

    @Field({ nullable: true })
    RecordDate?: Date;

    @Field({ nullable: true })
    RecordType?: string;

    @Field({ nullable: true })
    Description?: string;

    @Field({ nullable: true })
    VeterinarianStaffID: string | null;

    @Field(() => Float, { nullable: true })
    Cost?: number;

    @Field({ nullable: true })
    FollowUpDate: Date | null;

    @Field({ nullable: true })
    Notes: string | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Medical Records
//****************************************************************************
@InputType()
export class UpdateDogShelterMedicalRecordInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    DogID?: string;

    @Field({ nullable: true })
    RecordDate?: Date;

    @Field({ nullable: true })
    RecordType?: string;

    @Field({ nullable: true })
    Description?: string;

    @Field({ nullable: true })
    VeterinarianStaffID?: string | null;

    @Field(() => Float, { nullable: true })
    Cost?: number;

    @Field({ nullable: true })
    FollowUpDate?: Date | null;

    @Field({ nullable: true })
    Notes?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Medical Records
//****************************************************************************
@ObjectType()
export class RunDogShelterMedicalRecordViewResult {
    @Field(() => [DogShelterMedicalRecord_])
    Results: DogShelterMedicalRecord_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

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

@Resolver(DogShelterMedicalRecord_)
export class DogShelterMedicalRecordResolver extends ResolverBase {
    @Query(() => RunDogShelterMedicalRecordViewResult)
    async RunDogShelterMedicalRecordViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunDogShelterMedicalRecordViewResult)
    async RunDogShelterMedicalRecordViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunDogShelterMedicalRecordViewResult)
    async RunDogShelterMedicalRecordDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Medical Records';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => DogShelterMedicalRecord_, { nullable: true })
    async DogShelterMedicalRecord(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<DogShelterMedicalRecord_ | null> {
        this.CheckUserReadPermissions('Medical Records', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('DogShelter', 'vwMedicalRecords')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Medical Records', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Medical Records', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => DogShelterMedicalRecord_)
    async CreateDogShelterMedicalRecord(
        @Arg('input', () => CreateDogShelterMedicalRecordInput) input: CreateDogShelterMedicalRecordInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Medical Records', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => DogShelterMedicalRecord_)
    async UpdateDogShelterMedicalRecord(
        @Arg('input', () => UpdateDogShelterMedicalRecordInput) input: UpdateDogShelterMedicalRecordInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Medical Records', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => DogShelterMedicalRecord_)
    async DeleteDogShelterMedicalRecord(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Medical Records', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Play Session Players
//****************************************************************************
@ObjectType({ description: `Junction table linking a Player to a PlaySession, carrying that player\'s result for that session. Unlike GameDesigner, this junction has a payload -- score, placement, and win flag -- which is why CodeGen generates a data-bearing grid on both parent forms.` })
export class BoardGameNightPlaySessionPlayer_ {
    @Field({description: `Unique identifier for this participation record.`}) 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Foreign key to the PlaySession.`}) 
    @MaxLength(36)
    PlaySessionID: string;
        
    @Field({description: `Foreign key to the Player.`}) 
    @MaxLength(36)
    PlayerID: string;
        
    @Field(() => Int, {nullable: true, description: `Final score for this player. Null for cooperative and abandoned sessions, where individual scores do not exist.`}) 
    Score?: number;
        
    @Field(() => Int, {nullable: true, description: `Finishing position, 1 being first. Null for cooperative and abandoned sessions.`}) 
    Placement?: number;
        
    @Field(() => Boolean, {description: `Whether this player won. In a cooperative session every participant shares the same value.`}) 
    IsWinner: boolean;
        
    @Field({nullable: true, description: `Which faction, character, spirit, or player color this player used.`}) 
    @MaxLength(100)
    FactionOrColor?: string;
        
    @Field({nullable: true, description: `Free-form notes about this player's game.`}) 
    Notes?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(100)
    Player: string;
        
}

//****************************************************************************
// INPUT TYPE for Play Session Players
//****************************************************************************
@InputType()
export class CreateBoardGameNightPlaySessionPlayerInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    PlaySessionID?: string;

    @Field({ nullable: true })
    PlayerID?: string;

    @Field(() => Int, { nullable: true })
    Score: number | null;

    @Field(() => Int, { nullable: true })
    Placement: number | null;

    @Field(() => Boolean, { nullable: true })
    IsWinner?: boolean;

    @Field({ nullable: true })
    FactionOrColor: string | null;

    @Field({ nullable: true })
    Notes: string | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Play Session Players
//****************************************************************************
@InputType()
export class UpdateBoardGameNightPlaySessionPlayerInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    PlaySessionID?: string;

    @Field({ nullable: true })
    PlayerID?: string;

    @Field(() => Int, { nullable: true })
    Score?: number | null;

    @Field(() => Int, { nullable: true })
    Placement?: number | null;

    @Field(() => Boolean, { nullable: true })
    IsWinner?: boolean;

    @Field({ nullable: true })
    FactionOrColor?: string | null;

    @Field({ nullable: true })
    Notes?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Play Session Players
//****************************************************************************
@ObjectType()
export class RunBoardGameNightPlaySessionPlayerViewResult {
    @Field(() => [BoardGameNightPlaySessionPlayer_])
    Results: BoardGameNightPlaySessionPlayer_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

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

@Resolver(BoardGameNightPlaySessionPlayer_)
export class BoardGameNightPlaySessionPlayerResolver extends ResolverBase {
    @Query(() => RunBoardGameNightPlaySessionPlayerViewResult)
    async RunBoardGameNightPlaySessionPlayerViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunBoardGameNightPlaySessionPlayerViewResult)
    async RunBoardGameNightPlaySessionPlayerViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunBoardGameNightPlaySessionPlayerViewResult)
    async RunBoardGameNightPlaySessionPlayerDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Play Session Players';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => BoardGameNightPlaySessionPlayer_, { nullable: true })
    async BoardGameNightPlaySessionPlayer(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<BoardGameNightPlaySessionPlayer_ | null> {
        this.CheckUserReadPermissions('Play Session Players', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('BoardGameNight', 'vwPlaySessionPlayers')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Play Session Players', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Play Session Players', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => BoardGameNightPlaySessionPlayer_)
    async CreateBoardGameNightPlaySessionPlayer(
        @Arg('input', () => CreateBoardGameNightPlaySessionPlayerInput) input: CreateBoardGameNightPlaySessionPlayerInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Play Session Players', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => BoardGameNightPlaySessionPlayer_)
    async UpdateBoardGameNightPlaySessionPlayer(
        @Arg('input', () => UpdateBoardGameNightPlaySessionPlayerInput) input: UpdateBoardGameNightPlaySessionPlayerInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Play Session Players', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => BoardGameNightPlaySessionPlayer_)
    async DeleteBoardGameNightPlaySessionPlayer(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Play Session Players', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Play Sessions
//****************************************************************************
@ObjectType({ description: `One playthrough of one Game on one night. Has many participants through PlaySessionPlayer.` })
export class BoardGameNightPlaySession_ {
    @Field({description: `Unique identifier for this play session.`}) 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Foreign key to the Game that was played.`}) 
    @MaxLength(36)
    GameID: string;
        
    @Field({description: `Date and time the session started.`}) 
    PlayedAt: Date;
        
    @Field({nullable: true, description: `Where the session took place.`}) 
    @MaxLength(200)
    LocationName?: string;
        
    @Field(() => Int, {nullable: true, description: `Actual elapsed play time in minutes, including setup and teardown.`}) 
    DurationMinutes?: number;
        
    @Field({description: `How the session ended. Competitive games use Completed; cooperative games use Co-op Win or Co-op Loss; Abandoned means nobody finished. Constrained to a fixed list, which CodeGen turns into a dropdown.`}) 
    @MaxLength(30)
    Outcome: string;
        
    @Field({nullable: true, description: `Free-form notes about the session: memorable plays, rules arguments, what went wrong.`}) 
    Notes?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(255)
    Game: string;
        
    @Field(() => [BoardGameNightPlaySessionPlayer_])
    BoardGameNightPlaySessionPlayers_PlaySessionIDArray: BoardGameNightPlaySessionPlayer_[]; // Link to BoardGameNightPlaySessionPlayers
    
}

//****************************************************************************
// INPUT TYPE for Play Sessions
//****************************************************************************
@InputType()
export class CreateBoardGameNightPlaySessionInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    GameID?: string;

    @Field({ nullable: true })
    PlayedAt?: Date;

    @Field({ nullable: true })
    LocationName: string | null;

    @Field(() => Int, { nullable: true })
    DurationMinutes: number | null;

    @Field({ nullable: true })
    Outcome?: string;

    @Field({ nullable: true })
    Notes: string | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Play Sessions
//****************************************************************************
@InputType()
export class UpdateBoardGameNightPlaySessionInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    GameID?: string;

    @Field({ nullable: true })
    PlayedAt?: Date;

    @Field({ nullable: true })
    LocationName?: string | null;

    @Field(() => Int, { nullable: true })
    DurationMinutes?: number | null;

    @Field({ nullable: true })
    Outcome?: string;

    @Field({ nullable: true })
    Notes?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Play Sessions
//****************************************************************************
@ObjectType()
export class RunBoardGameNightPlaySessionViewResult {
    @Field(() => [BoardGameNightPlaySession_])
    Results: BoardGameNightPlaySession_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

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

@Resolver(BoardGameNightPlaySession_)
export class BoardGameNightPlaySessionResolver extends ResolverBase {
    @Query(() => RunBoardGameNightPlaySessionViewResult)
    async RunBoardGameNightPlaySessionViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunBoardGameNightPlaySessionViewResult)
    async RunBoardGameNightPlaySessionViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunBoardGameNightPlaySessionViewResult)
    async RunBoardGameNightPlaySessionDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Play Sessions';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => BoardGameNightPlaySession_, { nullable: true })
    async BoardGameNightPlaySession(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<BoardGameNightPlaySession_ | null> {
        this.CheckUserReadPermissions('Play Sessions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('BoardGameNight', 'vwPlaySessions')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Play Sessions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Play Sessions', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [BoardGameNightPlaySessionPlayer_])
    async BoardGameNightPlaySessionPlayers_PlaySessionIDArray(@Root() boardgamenightplaysession_: BoardGameNightPlaySession_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Play Session Players', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('BoardGameNight', 'vwPlaySessionPlayers')} WHERE ${provider.QuoteIdentifier('PlaySessionID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Play Session Players', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [boardgamenightplaysession_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Play Session Players', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => BoardGameNightPlaySession_)
    async CreateBoardGameNightPlaySession(
        @Arg('input', () => CreateBoardGameNightPlaySessionInput) input: CreateBoardGameNightPlaySessionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Play Sessions', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => BoardGameNightPlaySession_)
    async UpdateBoardGameNightPlaySession(
        @Arg('input', () => UpdateBoardGameNightPlaySessionInput) input: UpdateBoardGameNightPlaySessionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Play Sessions', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => BoardGameNightPlaySession_)
    async DeleteBoardGameNightPlaySession(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Play Sessions', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Players
//****************************************************************************
@ObjectType({ description: `A person who attends game night. Linked to PlaySession through PlaySessionPlayer, which also records how they did.` })
export class BoardGameNightPlayer_ {
    @Field({description: `Unique identifier for this player.`}) 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Player given name.`}) 
    @MaxLength(100)
    FirstName: string;
        
    @Field({description: `Player family name.`}) 
    @MaxLength(100)
    LastName: string;
        
    @Field({nullable: true, description: `What everyone actually calls them at the table.`}) 
    @MaxLength(50)
    Nickname?: string;
        
    @Field({nullable: true, description: `Contact email address. Unique across all players.`}) 
    @MaxLength(255)
    Email?: string;
        
    @Field({nullable: true, description: `Date this player first joined the group.`}) 
    JoinedDate?: Date;
        
    @Field({description: `Self-reported experience level. Constrained to a fixed list, which CodeGen turns into a dropdown.`}) 
    @MaxLength(20)
    SkillLevel: string;
        
    @Field(() => Boolean, {description: `Whether this player still attends. Inactive players are retained so historical sessions stay intact.`}) 
    IsActive: boolean;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [BoardGameNightPlaySessionPlayer_])
    BoardGameNightPlaySessionPlayers_PlayerIDArray: BoardGameNightPlaySessionPlayer_[]; // Link to BoardGameNightPlaySessionPlayers
    
}

//****************************************************************************
// INPUT TYPE for Players
//****************************************************************************
@InputType()
export class CreateBoardGameNightPlayerInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    Nickname: string | null;

    @Field({ nullable: true })
    Email: string | null;

    @Field({ nullable: true })
    JoinedDate: Date | null;

    @Field({ nullable: true })
    SkillLevel?: string;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Players
//****************************************************************************
@InputType()
export class UpdateBoardGameNightPlayerInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    Nickname?: string | null;

    @Field({ nullable: true })
    Email?: string | null;

    @Field({ nullable: true })
    JoinedDate?: Date | null;

    @Field({ nullable: true })
    SkillLevel?: string;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Players
//****************************************************************************
@ObjectType()
export class RunBoardGameNightPlayerViewResult {
    @Field(() => [BoardGameNightPlayer_])
    Results: BoardGameNightPlayer_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

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

@Resolver(BoardGameNightPlayer_)
export class BoardGameNightPlayerResolver extends ResolverBase {
    @Query(() => RunBoardGameNightPlayerViewResult)
    async RunBoardGameNightPlayerViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunBoardGameNightPlayerViewResult)
    async RunBoardGameNightPlayerViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunBoardGameNightPlayerViewResult)
    async RunBoardGameNightPlayerDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Players';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => BoardGameNightPlayer_, { nullable: true })
    async BoardGameNightPlayer(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<BoardGameNightPlayer_ | null> {
        this.CheckUserReadPermissions('Players', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('BoardGameNight', 'vwPlayers')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Players', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Players', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [BoardGameNightPlaySessionPlayer_])
    async BoardGameNightPlaySessionPlayers_PlayerIDArray(@Root() boardgamenightplayer_: BoardGameNightPlayer_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Play Session Players', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('BoardGameNight', 'vwPlaySessionPlayers')} WHERE ${provider.QuoteIdentifier('PlayerID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Play Session Players', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [boardgamenightplayer_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Play Session Players', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => BoardGameNightPlayer_)
    async CreateBoardGameNightPlayer(
        @Arg('input', () => CreateBoardGameNightPlayerInput) input: CreateBoardGameNightPlayerInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Players', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => BoardGameNightPlayer_)
    async UpdateBoardGameNightPlayer(
        @Arg('input', () => UpdateBoardGameNightPlayerInput) input: UpdateBoardGameNightPlayerInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Players', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => BoardGameNightPlayer_)
    async DeleteBoardGameNightPlayer(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Players', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Publishers
//****************************************************************************
@ObjectType({ description: `A company that publishes board games. Parent of Game in a one-to-many relationship.` })
export class BoardGameNightPublisher_ {
    @Field({description: `Unique identifier for this publisher.`}) 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Company name as it appears on the box. Unique across all publishers.`}) 
    @MaxLength(200)
    Name: string;
        
    @Field(() => Int, {nullable: true, description: `Year the company was founded.`}) 
    FoundedYear?: number;
        
    @Field({nullable: true, description: `Country where the publisher is headquartered.`}) 
    @MaxLength(100)
    Country?: string;
        
    @Field({nullable: true, description: `Publisher website URL.`}) 
    @MaxLength(500)
    Website?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => Float, {nullable: true}) 
    _mj__Latitude?: number;
        
    @Field(() => Float, {nullable: true}) 
    _mj__Longitude?: number;
        
    @Field(() => [BoardGameNightGame_])
    BoardGameNightGames_PublisherIDArray: BoardGameNightGame_[]; // Link to BoardGameNightGames
    
}

//****************************************************************************
// INPUT TYPE for Publishers
//****************************************************************************
@InputType()
export class CreateBoardGameNightPublisherInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field(() => Int, { nullable: true })
    FoundedYear: number | null;

    @Field({ nullable: true })
    Country: string | null;

    @Field({ nullable: true })
    Website: string | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Publishers
//****************************************************************************
@InputType()
export class UpdateBoardGameNightPublisherInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field(() => Int, { nullable: true })
    FoundedYear?: number | null;

    @Field({ nullable: true })
    Country?: string | null;

    @Field({ nullable: true })
    Website?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Publishers
//****************************************************************************
@ObjectType()
export class RunBoardGameNightPublisherViewResult {
    @Field(() => [BoardGameNightPublisher_])
    Results: BoardGameNightPublisher_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

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

@Resolver(BoardGameNightPublisher_)
export class BoardGameNightPublisherResolver extends ResolverBase {
    @Query(() => RunBoardGameNightPublisherViewResult)
    async RunBoardGameNightPublisherViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunBoardGameNightPublisherViewResult)
    async RunBoardGameNightPublisherViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunBoardGameNightPublisherViewResult)
    async RunBoardGameNightPublisherDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Publishers';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => BoardGameNightPublisher_, { nullable: true })
    async BoardGameNightPublisher(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<BoardGameNightPublisher_ | null> {
        this.CheckUserReadPermissions('Publishers', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('BoardGameNight', 'vwPublishers')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Publishers', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Publishers', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [BoardGameNightGame_])
    async BoardGameNightGames_PublisherIDArray(@Root() boardgamenightpublisher_: BoardGameNightPublisher_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Games', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('BoardGameNight', 'vwGames')} WHERE ${provider.QuoteIdentifier('PublisherID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Games', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [boardgamenightpublisher_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Games', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => BoardGameNightPublisher_)
    async CreateBoardGameNightPublisher(
        @Arg('input', () => CreateBoardGameNightPublisherInput) input: CreateBoardGameNightPublisherInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Publishers', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => BoardGameNightPublisher_)
    async UpdateBoardGameNightPublisher(
        @Arg('input', () => UpdateBoardGameNightPublisherInput) input: UpdateBoardGameNightPublisherInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Publishers', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => BoardGameNightPublisher_)
    async DeleteBoardGameNightPublisher(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Publishers', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Shelters
//****************************************************************************
@ObjectType({ description: `A physical shelter location that houses dogs. Root entity of the DogShelter demo schema - staff and dogs both belong to exactly one shelter.` })
export class DogShelterShelter_ {
    @Field({description: `Unique identifier for the shelter location.`}) 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Public-facing name of the shelter. Unique across all locations.`}) 
    @MaxLength(200)
    Name: string;
        
    @Field({nullable: true, description: `Street address of the shelter.`}) 
    @MaxLength(200)
    AddressLine1?: string;
        
    @Field({description: `City where the shelter is located.`}) 
    @MaxLength(100)
    City: string;
        
    @Field({description: `State or province where the shelter is located.`}) 
    @MaxLength(50)
    State: string;
        
    @Field({nullable: true, description: `Postal or ZIP code of the shelter address.`}) 
    @MaxLength(20)
    PostalCode?: string;
        
    @Field({nullable: true, description: `Main public phone number for adoption inquiries.`}) 
    @MaxLength(50)
    Phone?: string;
        
    @Field({nullable: true, description: `General contact email address for the shelter.`}) 
    @MaxLength(255)
    Email?: string;
        
    @Field(() => Int, {description: `Maximum number of dogs the shelter can physically house at one time. Used as the denominator when calculating occupancy.`}) 
    KennelCapacity: number;
        
    @Field({nullable: true, description: `Date this shelter location opened.`}) 
    OpenedDate?: Date;
        
    @Field(() => Boolean, {description: `When 0, the shelter is at or over capacity and is temporarily refusing new intakes.`}) 
    IsAcceptingIntakes: boolean;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => Float, {nullable: true}) 
    _mj__Latitude?: number;
        
    @Field(() => Float, {nullable: true}) 
    _mj__Longitude?: number;
        
    @Field(() => [DogShelterDog_])
    DogShelterDogs_ShelterIDArray: DogShelterDog_[]; // Link to DogShelterDogs
    
    @Field(() => [DogShelterStaff_])
    DogShelterStaffs_ShelterIDArray: DogShelterStaff_[]; // Link to DogShelterStaffs
    
}

//****************************************************************************
// INPUT TYPE for Shelters
//****************************************************************************
@InputType()
export class CreateDogShelterShelterInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    AddressLine1: string | null;

    @Field({ nullable: true })
    City?: string;

    @Field({ nullable: true })
    State?: string;

    @Field({ nullable: true })
    PostalCode: string | null;

    @Field({ nullable: true })
    Phone: string | null;

    @Field({ nullable: true })
    Email: string | null;

    @Field(() => Int, { nullable: true })
    KennelCapacity?: number;

    @Field({ nullable: true })
    OpenedDate: Date | null;

    @Field(() => Boolean, { nullable: true })
    IsAcceptingIntakes?: boolean;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Shelters
//****************************************************************************
@InputType()
export class UpdateDogShelterShelterInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    AddressLine1?: string | null;

    @Field({ nullable: true })
    City?: string;

    @Field({ nullable: true })
    State?: string;

    @Field({ nullable: true })
    PostalCode?: string | null;

    @Field({ nullable: true })
    Phone?: string | null;

    @Field({ nullable: true })
    Email?: string | null;

    @Field(() => Int, { nullable: true })
    KennelCapacity?: number;

    @Field({ nullable: true })
    OpenedDate?: Date | null;

    @Field(() => Boolean, { nullable: true })
    IsAcceptingIntakes?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Shelters
//****************************************************************************
@ObjectType()
export class RunDogShelterShelterViewResult {
    @Field(() => [DogShelterShelter_])
    Results: DogShelterShelter_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

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

@Resolver(DogShelterShelter_)
export class DogShelterShelterResolver extends ResolverBase {
    @Query(() => RunDogShelterShelterViewResult)
    async RunDogShelterShelterViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunDogShelterShelterViewResult)
    async RunDogShelterShelterViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunDogShelterShelterViewResult)
    async RunDogShelterShelterDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Shelters';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => DogShelterShelter_, { nullable: true })
    async DogShelterShelter(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<DogShelterShelter_ | null> {
        this.CheckUserReadPermissions('Shelters', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('DogShelter', 'vwShelters')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Shelters', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Shelters', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [DogShelterDog_])
    async DogShelterDogs_ShelterIDArray(@Root() dogsheltershelter_: DogShelterShelter_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Dogs', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('DogShelter', 'vwDogs')} WHERE ${provider.QuoteIdentifier('ShelterID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Dogs', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [dogsheltershelter_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Dogs', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [DogShelterStaff_])
    async DogShelterStaffs_ShelterIDArray(@Root() dogsheltershelter_: DogShelterShelter_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Staffs', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('DogShelter', 'vwStaffs')} WHERE ${provider.QuoteIdentifier('ShelterID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Staffs', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [dogsheltershelter_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Staffs', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => DogShelterShelter_)
    async CreateDogShelterShelter(
        @Arg('input', () => CreateDogShelterShelterInput) input: CreateDogShelterShelterInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Shelters', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => DogShelterShelter_)
    async UpdateDogShelterShelter(
        @Arg('input', () => UpdateDogShelterShelterInput) input: UpdateDogShelterShelterInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Shelters', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => DogShelterShelter_)
    async DeleteDogShelterShelter(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Shelters', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Staffs
//****************************************************************************
@ObjectType({ description: `Shelter employees and volunteers. Self-referencing through SupervisorID to form a reporting hierarchy.` })
export class DogShelterStaff_ {
    @Field({description: `Unique identifier for the staff member.`}) 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `The shelter location this person works at.`}) 
    @MaxLength(36)
    ShelterID: string;
        
    @Field({description: `Given name of the staff member.`}) 
    @MaxLength(100)
    FirstName: string;
        
    @Field({description: `Family name of the staff member.`}) 
    @MaxLength(100)
    LastName: string;
        
    @Field({description: `PERSISTED computed column: FirstName plus a space plus LastName. Read-only. Serves as the human-readable display value wherever a staff member is referenced.`}) 
    @MaxLength(201)
    FullName: string;
        
    @Field({description: `Work email address. Unique across all staff.`}) 
    @MaxLength(255)
    Email: string;
        
    @Field({nullable: true, description: `Contact phone number for the staff member.`}) 
    @MaxLength(50)
    Phone?: string;
        
    @Field({description: `Job function. One of: Shelter Manager, Adoption Counselor, Veterinarian, Vet Tech, Kennel Attendant, Volunteer Coordinator, Volunteer. Only Veterinarian and Vet Tech records appear as the vet on a medical record.`}) 
    @MaxLength(50)
    Role: string;
        
    @Field({description: `Date the person started working or volunteering at the shelter.`}) 
    HireDate: Date;
        
    @Field(() => Boolean, {description: `When 0, the person no longer works at the shelter. Historical records still reference them, so rows are deactivated rather than deleted.`}) 
    IsActive: boolean;
        
    @Field({nullable: true, description: `SELF-REFERENCING foreign key to the staff member this person reports to. NULL for the shelter manager at the top of each location hierarchy.`}) 
    @MaxLength(36)
    SupervisorID?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(200)
    Shelter: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    RootSupervisorID?: string;
        
    @Field(() => [DogShelterStaff_])
    DogShelterStaffs_SupervisorIDArray: DogShelterStaff_[]; // Link to DogShelterStaffs
    
    @Field(() => [DogShelterDogTrait_])
    DogShelterDogTraits_AssignedByStaffIDArray: DogShelterDogTrait_[]; // Link to DogShelterDogTraits
    
    @Field(() => [DogShelterAdoptionApplication_])
    DogShelterAdoptionApplications_ReviewedByStaffIDArray: DogShelterAdoptionApplication_[]; // Link to DogShelterAdoptionApplications
    
    @Field(() => [DogShelterMedicalRecord_])
    DogShelterMedicalRecords_VeterinarianStaffIDArray: DogShelterMedicalRecord_[]; // Link to DogShelterMedicalRecords
    
}

//****************************************************************************
// INPUT TYPE for Staffs
//****************************************************************************
@InputType()
export class CreateDogShelterStaffInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    ShelterID?: string;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    Email?: string;

    @Field({ nullable: true })
    Phone: string | null;

    @Field({ nullable: true })
    Role?: string;

    @Field({ nullable: true })
    HireDate?: Date;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field({ nullable: true })
    SupervisorID: string | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Staffs
//****************************************************************************
@InputType()
export class UpdateDogShelterStaffInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    ShelterID?: string;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    Email?: string;

    @Field({ nullable: true })
    Phone?: string | null;

    @Field({ nullable: true })
    Role?: string;

    @Field({ nullable: true })
    HireDate?: Date;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field({ nullable: true })
    SupervisorID?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Staffs
//****************************************************************************
@ObjectType()
export class RunDogShelterStaffViewResult {
    @Field(() => [DogShelterStaff_])
    Results: DogShelterStaff_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

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

@Resolver(DogShelterStaff_)
export class DogShelterStaffResolver extends ResolverBase {
    @Query(() => RunDogShelterStaffViewResult)
    async RunDogShelterStaffViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunDogShelterStaffViewResult)
    async RunDogShelterStaffViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunDogShelterStaffViewResult)
    async RunDogShelterStaffDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Staffs';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => DogShelterStaff_, { nullable: true })
    async DogShelterStaff(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<DogShelterStaff_ | null> {
        this.CheckUserReadPermissions('Staffs', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('DogShelter', 'vwStaffs')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Staffs', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Staffs', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [DogShelterStaff_])
    async DogShelterStaffs_SupervisorIDArray(@Root() dogshelterstaff_: DogShelterStaff_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Staffs', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('DogShelter', 'vwStaffs')} WHERE ${provider.QuoteIdentifier('SupervisorID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Staffs', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [dogshelterstaff_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Staffs', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [DogShelterDogTrait_])
    async DogShelterDogTraits_AssignedByStaffIDArray(@Root() dogshelterstaff_: DogShelterStaff_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Dog Traits', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('DogShelter', 'vwDogTraits')} WHERE ${provider.QuoteIdentifier('AssignedByStaffID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Dog Traits', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [dogshelterstaff_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Dog Traits', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [DogShelterAdoptionApplication_])
    async DogShelterAdoptionApplications_ReviewedByStaffIDArray(@Root() dogshelterstaff_: DogShelterStaff_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Adoption Applications', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('DogShelter', 'vwAdoptionApplications')} WHERE ${provider.QuoteIdentifier('ReviewedByStaffID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Adoption Applications', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [dogshelterstaff_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Adoption Applications', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [DogShelterMedicalRecord_])
    async DogShelterMedicalRecords_VeterinarianStaffIDArray(@Root() dogshelterstaff_: DogShelterStaff_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Medical Records', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('DogShelter', 'vwMedicalRecords')} WHERE ${provider.QuoteIdentifier('VeterinarianStaffID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Medical Records', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [dogshelterstaff_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Medical Records', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => DogShelterStaff_)
    async CreateDogShelterStaff(
        @Arg('input', () => CreateDogShelterStaffInput) input: CreateDogShelterStaffInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Staffs', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => DogShelterStaff_)
    async UpdateDogShelterStaff(
        @Arg('input', () => UpdateDogShelterStaffInput) input: UpdateDogShelterStaffInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Staffs', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => DogShelterStaff_)
    async DeleteDogShelterStaff(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Staffs', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Traits
//****************************************************************************
@ObjectType({ description: `Controlled vocabulary of behavioral and care tags that can be applied to dogs through the DogTrait junction table.` })
export class DogShelterTrait_ {
    @Field({description: `Unique identifier for the trait.`}) 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Short label shown as a tag on the dog record, for example Loves Car Rides.`}) 
    @MaxLength(100)
    Name: string;
        
    @Field({description: `Grouping for the trait. One of: Temperament, Training, Special Needs, Activity.`}) 
    @MaxLength(30)
    Category: string;
        
    @Field({nullable: true, description: `Explanation of what the trait means and how staff should apply it.`}) 
    @MaxLength(500)
    Description?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [DogShelterDogTrait_])
    DogShelterDogTraits_TraitIDArray: DogShelterDogTrait_[]; // Link to DogShelterDogTraits
    
}

//****************************************************************************
// INPUT TYPE for Traits
//****************************************************************************
@InputType()
export class CreateDogShelterTraitInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Category?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Traits
//****************************************************************************
@InputType()
export class UpdateDogShelterTraitInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Category?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Traits
//****************************************************************************
@ObjectType()
export class RunDogShelterTraitViewResult {
    @Field(() => [DogShelterTrait_])
    Results: DogShelterTrait_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

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

@Resolver(DogShelterTrait_)
export class DogShelterTraitResolver extends ResolverBase {
    @Query(() => RunDogShelterTraitViewResult)
    async RunDogShelterTraitViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunDogShelterTraitViewResult)
    async RunDogShelterTraitViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunDogShelterTraitViewResult)
    async RunDogShelterTraitDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Traits';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => DogShelterTrait_, { nullable: true })
    async DogShelterTrait(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<DogShelterTrait_ | null> {
        this.CheckUserReadPermissions('Traits', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('DogShelter', 'vwTraits')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Traits', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Traits', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [DogShelterDogTrait_])
    async DogShelterDogTraits_TraitIDArray(@Root() dogsheltertrait_: DogShelterTrait_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Dog Traits', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('DogShelter', 'vwDogTraits')} WHERE ${provider.QuoteIdentifier('TraitID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Dog Traits', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [dogsheltertrait_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Dog Traits', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => DogShelterTrait_)
    async CreateDogShelterTrait(
        @Arg('input', () => CreateDogShelterTraitInput) input: CreateDogShelterTraitInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Traits', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => DogShelterTrait_)
    async UpdateDogShelterTrait(
        @Arg('input', () => UpdateDogShelterTraitInput) input: UpdateDogShelterTraitInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Traits', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => DogShelterTrait_)
    async DeleteDogShelterTrait(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Traits', key, options, provider, userPayload, pubSub);
    }
    
}