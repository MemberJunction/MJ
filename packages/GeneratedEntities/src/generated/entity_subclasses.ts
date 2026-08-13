import { BaseEntity, EntitySaveOptions, EntityDeleteOptions, CompositeKey, ValidationResult, ValidationErrorInfo, ValidationErrorType, Metadata, ProviderType, DatabaseProviderBase } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { z } from "zod";

export const loadModule = () => {
  // no-op, only used to ensure this file is a valid module and to allow easy loading
}

     
 
/**
 * zod schema definition for the entity Adopters
 */
export const DogShelterAdopterSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()
        * * Description: Unique identifier for the adopter.`),
    FirstName: z.string().describe(`
        * * Field Name: FirstName
        * * Display Name: First Name
        * * SQL Data Type: nvarchar(100)
        * * Description: Given name of the adopter.`),
    LastName: z.string().describe(`
        * * Field Name: LastName
        * * Display Name: Last Name
        * * SQL Data Type: nvarchar(100)
        * * Description: Family name of the adopter.`),
    FullName: z.string().describe(`
        * * Field Name: FullName
        * * Display Name: Full Name
        * * SQL Data Type: nvarchar(201)
        * * Description: PERSISTED computed column: FirstName plus a space plus LastName. Read-only display value.`),
    Email: z.string().describe(`
        * * Field Name: Email
        * * Display Name: Email
        * * SQL Data Type: nvarchar(255)
        * * Description: Primary email address. Unique - the shelter uses it to detect repeat applicants.`),
    Phone: z.string().nullable().describe(`
        * * Field Name: Phone
        * * Display Name: Phone
        * * SQL Data Type: nvarchar(50)
        * * Description: Contact phone number for the adopter.`),
    AddressLine1: z.string().nullable().describe(`
        * * Field Name: AddressLine1
        * * Display Name: Address Line 1
        * * SQL Data Type: nvarchar(200)
        * * Description: Home street address, used for home visits.`),
    City: z.string().nullable().describe(`
        * * Field Name: City
        * * Display Name: City
        * * SQL Data Type: nvarchar(100)
        * * Description: City of the adopter home address.`),
    State: z.string().nullable().describe(`
        * * Field Name: State
        * * Display Name: State
        * * SQL Data Type: nvarchar(50)
        * * Description: State or province of the adopter home address.`),
    PostalCode: z.string().nullable().describe(`
        * * Field Name: PostalCode
        * * Display Name: Postal Code
        * * SQL Data Type: nvarchar(20)
        * * Description: Postal or ZIP code of the adopter home address.`),
    HousingType: z.union([z.literal('Apartment'), z.literal('Condo'), z.literal('Farm'), z.literal('House'), z.literal('Townhouse')]).describe(`
        * * Field Name: HousingType
        * * Display Name: Housing Type
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Apartment
    *   * Condo
    *   * Farm
    *   * House
    *   * Townhouse
        * * Description: Type of home. One of: House, Apartment, Condo, Townhouse, Farm. Combined with HasFencedYard when matching high-energy dogs.`),
    HasFencedYard: z.boolean().describe(`
        * * Field Name: HasFencedYard
        * * Display Name: Has Fenced Yard
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Whether the property has a securely fenced yard. Required for some dogs.`),
    HasOtherPets: z.boolean().describe(`
        * * Field Name: HasOtherPets
        * * Display Name: Has Other Pets
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Whether the household already has other pets. Relevant to dogs flagged GoodWithDogs or GoodWithCats = 0.`),
    HouseholdAdults: z.number().describe(`
        * * Field Name: HouseholdAdults
        * * Display Name: Household Adults
        * * SQL Data Type: int
        * * Default Value: 1
        * * Description: Number of adults living in the household.`),
    HouseholdChildren: z.number().describe(`
        * * Field Name: HouseholdChildren
        * * Display Name: Household Children
        * * SQL Data Type: int
        * * Default Value: 0
        * * Description: Number of children living in the household. Relevant to dogs flagged GoodWithKids = 0.`),
    IsFosterApproved: z.boolean().describe(`
        * * Field Name: IsFosterApproved
        * * Display Name: Is Foster Approved
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Whether this person has completed foster training and may take foster placements.`),
    DateRegistered: z.date().describe(`
        * * Field Name: DateRegistered
        * * Display Name: Date Registered
        * * SQL Data Type: date
        * * Description: Date the person first registered with the shelter.`),
    Notes: z.string().nullable().describe(`
        * * Field Name: Notes
        * * Display Name: Notes
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Free-form staff notes about the adopter.`),
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

export type DogShelterAdopterEntityType = z.infer<typeof DogShelterAdopterSchema>;

/**
 * zod schema definition for the entity Adoption Applications
 */
export const DogShelterAdoptionApplicationSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()
        * * Description: Unique identifier for the application.`),
    DogID: z.string().describe(`
        * * Field Name: DogID
        * * Display Name: Dog
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Dogs (vwDogs.ID)
        * * Description: The dog being applied for. A dog can receive several competing applications.`),
    AdopterID: z.string().describe(`
        * * Field Name: AdopterID
        * * Display Name: Adopter
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Adopters (vwAdopters.ID)
        * * Description: The person applying.`),
    SubmittedAt: z.date().describe(`
        * * Field Name: SubmittedAt
        * * Display Name: Submitted At
        * * SQL Data Type: datetimeoffset
        * * Description: When the application was submitted.`),
    Status: z.union([z.literal('Approved'), z.literal('Completed'), z.literal('Denied'), z.literal('Submitted'), z.literal('Under Review'), z.literal('Withdrawn')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(30)
        * * Default Value: Submitted
    * * Value List Type: List
    * * Possible Values 
    *   * Approved
    *   * Completed
    *   * Denied
    *   * Submitted
    *   * Under Review
    *   * Withdrawn
        * * Description: Workflow state. One of: Submitted, Under Review, Approved, Denied, Withdrawn, Completed. Completed means the adoption actually happened and AdoptionDate is set.`),
    ReviewedByStaffID: z.string().nullable().describe(`
        * * Field Name: ReviewedByStaffID
        * * Display Name: Reviewed By Staff
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Staffs (vwStaffs.ID)
        * * Description: The staff member who reviewed the application, normally an Adoption Counselor. NULL while the application is still unreviewed.`),
    ReviewedAt: z.date().nullable().describe(`
        * * Field Name: ReviewedAt
        * * Display Name: Reviewed At
        * * SQL Data Type: datetimeoffset
        * * Description: When the review decision was recorded.`),
    HomeVisitDate: z.date().nullable().describe(`
        * * Field Name: HomeVisitDate
        * * Display Name: Home Visit Date
        * * SQL Data Type: date
        * * Description: Date of the in-home visit, where the process requires one.`),
    DecisionNotes: z.string().nullable().describe(`
        * * Field Name: DecisionNotes
        * * Display Name: Decision Notes
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Staff rationale for the approval or denial.`),
    AdoptionDate: z.date().nullable().describe(`
        * * Field Name: AdoptionDate
        * * Display Name: Adoption Date
        * * SQL Data Type: date
        * * Description: Date the adoption was finalized. Set only on Completed applications and matches the OutcomeDate on the dog.`),
    FeePaid: z.number().nullable().describe(`
        * * Field Name: FeePaid
        * * Display Name: Fee Paid
        * * SQL Data Type: decimal(10, 2)
        * * Description: Adoption fee actually collected, which may differ from the listed fee after a waiver or promotion.`),
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
    Dog: z.string().describe(`
        * * Field Name: Dog
        * * Display Name: Dog Name
        * * SQL Data Type: nvarchar(100)`),
    Adopter: z.string().describe(`
        * * Field Name: Adopter
        * * Display Name: Adopter Name
        * * SQL Data Type: nvarchar(100)`),
    ReviewedByStaff: z.string().nullable().describe(`
        * * Field Name: ReviewedByStaff
        * * Display Name: Reviewer Name
        * * SQL Data Type: nvarchar(100)`),
});

export type DogShelterAdoptionApplicationEntityType = z.infer<typeof DogShelterAdoptionApplicationSchema>;

/**
 * zod schema definition for the entity Breeds
 */
export const DogShelterBreedSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()
        * * Description: Unique identifier for the breed.`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Breed Name
        * * SQL Data Type: nvarchar(150)
        * * Description: Common name of the breed, for example Labrador Retriever. Includes a Mixed Breed entry for dogs of unknown ancestry.`),
    SizeCategory: z.union([z.literal('Giant'), z.literal('Large'), z.literal('Medium'), z.literal('Small'), z.literal('Toy')]).describe(`
        * * Field Name: SizeCategory
        * * Display Name: Size Category
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Giant
    *   * Large
    *   * Medium
    *   * Small
    *   * Toy
        * * Description: Size class of the breed. One of: Toy, Small, Medium, Large, Giant.`),
    TypicalWeightLbsLow: z.number().nullable().describe(`
        * * Field Name: TypicalWeightLbsLow
        * * Display Name: Typical Weight (Low)
        * * SQL Data Type: int
        * * Description: Low end of the typical healthy adult weight range, in pounds.`),
    TypicalWeightLbsHigh: z.number().nullable().describe(`
        * * Field Name: TypicalWeightLbsHigh
        * * Display Name: Typical Weight (High)
        * * SQL Data Type: int
        * * Description: High end of the typical healthy adult weight range, in pounds. Always greater than or equal to TypicalWeightLbsLow.`),
    EnergyLevel: z.union([z.literal('High'), z.literal('Low'), z.literal('Moderate'), z.literal('Very High')]).describe(`
        * * Field Name: EnergyLevel
        * * Display Name: Energy Level
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * High
    *   * Low
    *   * Moderate
    *   * Very High
        * * Description: How much daily exercise the breed typically needs. One of: Low, Moderate, High, Very High. Adoption counselors use this to match dogs to households.`),
    GroomingNeeds: z.union([z.literal('High'), z.literal('Minimal'), z.literal('Moderate')]).describe(`
        * * Field Name: GroomingNeeds
        * * Display Name: Grooming Needs
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * High
    *   * Minimal
    *   * Moderate
        * * Description: Typical grooming burden for the breed. One of: Minimal, Moderate, High.`),
    TypicalLifespanYears: z.number().nullable().describe(`
        * * Field Name: TypicalLifespanYears
        * * Display Name: Typical Lifespan (Years)
        * * SQL Data Type: int
        * * Description: Typical lifespan of the breed in years.`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(1000)
        * * Description: Narrative description of the breed temperament and typical care needs.`),
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

export type DogShelterBreedEntityType = z.infer<typeof DogShelterBreedSchema>;

/**
 * zod schema definition for the entity Designers
 */
export const BoardGameNightDesignerSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()
        * * Description: Unique identifier for this designer.`),
    FirstName: z.string().describe(`
        * * Field Name: FirstName
        * * Display Name: First Name
        * * SQL Data Type: nvarchar(100)
        * * Description: Designer given name.`),
    LastName: z.string().describe(`
        * * Field Name: LastName
        * * Display Name: Last Name
        * * SQL Data Type: nvarchar(100)
        * * Description: Designer family name.`),
    Bio: z.string().nullable().describe(`
        * * Field Name: Bio
        * * Display Name: Biography
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Short biography or notable design credits.`),
    Website: z.string().nullable().describe(`
        * * Field Name: Website
        * * Display Name: Website
        * * SQL Data Type: nvarchar(500)
        * * Description: Designer personal or studio website URL.`),
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

export type BoardGameNightDesignerEntityType = z.infer<typeof BoardGameNightDesignerSchema>;

/**
 * zod schema definition for the entity Dog Traits
 */
export const DogShelterDogTraitSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()
        * * Description: Unique identifier for the dog-trait assignment.`),
    DogID: z.string().describe(`
        * * Field Name: DogID
        * * Display Name: Dog
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Dogs (vwDogs.ID)
        * * Description: The dog being tagged.`),
    TraitID: z.string().describe(`
        * * Field Name: TraitID
        * * Display Name: Trait
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Traits (vwTraits.ID)
        * * Description: The trait being applied.`),
    AssignedByStaffID: z.string().nullable().describe(`
        * * Field Name: AssignedByStaffID
        * * Display Name: Assigned By Staff
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Staffs (vwStaffs.ID)
        * * Description: The staff member who observed and recorded the trait.`),
    AssignedAt: z.date().describe(`
        * * Field Name: AssignedAt
        * * Display Name: Assigned At
        * * SQL Data Type: datetimeoffset
        * * Default Value: sysdatetimeoffset()
        * * Description: When the trait was assigned.`),
    Notes: z.string().nullable().describe(`
        * * Field Name: Notes
        * * Display Name: Notes
        * * SQL Data Type: nvarchar(500)
        * * Description: Context for the tag, for example the specific situation where the behavior was observed.`),
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
    Dog: z.string().describe(`
        * * Field Name: Dog
        * * Display Name: Dog Name
        * * SQL Data Type: nvarchar(100)`),
    Trait: z.string().describe(`
        * * Field Name: Trait
        * * Display Name: Trait Name
        * * SQL Data Type: nvarchar(100)`),
    AssignedByStaff: z.string().nullable().describe(`
        * * Field Name: AssignedByStaff
        * * Display Name: Assigned By Staff Name
        * * SQL Data Type: nvarchar(100)`),
});

export type DogShelterDogTraitEntityType = z.infer<typeof DogShelterDogTraitSchema>;

/**
 * zod schema definition for the entity Dogs
 */
export const DogShelterDogSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()
        * * Description: Unique identifier for the dog.`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(100)
        * * Description: Name the shelter uses for the dog. Assigned by staff on intake for strays.`),
    ShelterID: z.string().describe(`
        * * Field Name: ShelterID
        * * Display Name: Shelter
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Shelters (vwShelters.ID)
        * * Description: The shelter location currently responsible for this dog.`),
    PrimaryBreedID: z.string().describe(`
        * * Field Name: PrimaryBreedID
        * * Display Name: Primary Breed
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Breeds (vwBreeds.ID)
        * * Description: Best-guess primary breed. One of TWO foreign keys from this table to Breed - see also SecondaryBreedID.`),
    SecondaryBreedID: z.string().nullable().describe(`
        * * Field Name: SecondaryBreedID
        * * Display Name: Secondary Breed
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Breeds (vwBreeds.ID)
        * * Description: Second breed for a mixed-breed dog, or NULL if the dog appears purebred or the mix is unknown. The SECOND foreign key from this table to Breed. Always different from PrimaryBreedID.`),
    MotherID: z.string().nullable().describe(`
        * * Field Name: MotherID
        * * Display Name: Mother
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Dogs (vwDogs.ID)
        * * Description: SELF-REFERENCING foreign key to the mother of this dog, populated only for puppies born in shelter care. NULL for every dog that arrived from outside.`),
    Sex: z.union([z.literal('Female'), z.literal('Male')]).describe(`
        * * Field Name: Sex
        * * Display Name: Sex
        * * SQL Data Type: nvarchar(10)
    * * Value List Type: List
    * * Possible Values 
    *   * Female
    *   * Male
        * * Description: Sex of the dog. One of: Male, Female.`),
    EstimatedBirthDate: z.date().nullable().describe(`
        * * Field Name: EstimatedBirthDate
        * * Display Name: Estimated Birth Date
        * * SQL Data Type: date
        * * Description: Estimated date of birth. For strays this is a veterinary estimate from dentition, not a known date.`),
    EstimatedAgeMonths: z.number().nullable().describe(`
        * * Field Name: EstimatedAgeMonths
        * * Display Name: Estimated Age (Months)
        * * SQL Data Type: int
        * * Description: COMPUTED, NOT PERSISTED: whole months between EstimatedBirthDate and today. Read-only and recalculated on every read, so it cannot be indexed.`),
    WeightLbs: z.number().nullable().describe(`
        * * Field Name: WeightLbs
        * * Display Name: Weight (Lbs)
        * * SQL Data Type: decimal(6, 2)
        * * Description: Most recent recorded weight in pounds.`),
    Color: z.string().nullable().describe(`
        * * Field Name: Color
        * * Display Name: Color
        * * SQL Data Type: nvarchar(100)
        * * Description: Coat color and pattern as described by staff, for example Black and White or Brindle.`),
    MicrochipNumber: z.string().nullable().describe(`
        * * Field Name: MicrochipNumber
        * * Display Name: Microchip Number
        * * SQL Data Type: nvarchar(50)
        * * Description: Implanted microchip number. Unique when present, NULL for dogs not yet chipped.`),
    IntakeDate: z.date().describe(`
        * * Field Name: IntakeDate
        * * Display Name: Intake Date
        * * SQL Data Type: date
        * * Description: Date the dog entered the care of the shelter. The clock that length-of-stay is measured from.`),
    IntakeType: z.union([z.literal('Born In Care'), z.literal('Owner Surrender'), z.literal('Return'), z.literal('Stray'), z.literal('Transfer')]).describe(`
        * * Field Name: IntakeType
        * * Display Name: Intake Type
        * * SQL Data Type: nvarchar(30)
    * * Value List Type: List
    * * Possible Values 
    *   * Born In Care
    *   * Owner Surrender
    *   * Return
    *   * Stray
    *   * Transfer
        * * Description: How the dog arrived. One of: Stray, Owner Surrender, Transfer, Born In Care, Return. Return means a previously adopted dog came back.`),
    Status: z.union([z.literal('Adopted'), z.literal('Available'), z.literal('Fostered'), z.literal('Intake'), z.literal('Medical Hold'), z.literal('Pending'), z.literal('Transferred')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(30)
        * * Default Value: Intake
    * * Value List Type: List
    * * Possible Values 
    *   * Adopted
    *   * Available
    *   * Fostered
    *   * Intake
    *   * Medical Hold
    *   * Pending
    *   * Transferred
        * * Description: Current disposition. One of: Intake, Available, Pending, Fostered, Medical Hold, Adopted, Transferred. Only Available dogs are shown to the public; Pending means an approved application is in progress. Adopted and Transferred are terminal and always have an OutcomeDate.`),
    OutcomeDate: z.date().nullable().describe(`
        * * Field Name: OutcomeDate
        * * Display Name: Outcome Date
        * * SQL Data Type: date
        * * Description: Date the dog left the care of the shelter through adoption or transfer. NULL while the dog is still in care. Never earlier than IntakeDate.`),
    DaysInCare: z.number().nullable().describe(`
        * * Field Name: DaysInCare
        * * Display Name: Days In Care
        * * SQL Data Type: int
        * * Description: COMPUTED, NOT PERSISTED: days between IntakeDate and OutcomeDate, or between IntakeDate and today for a dog still in care. This is the length-of-stay metric the shelter manages against.`),
    IsSpayedNeutered: z.boolean().describe(`
        * * Field Name: IsSpayedNeutered
        * * Display Name: Spayed/Neutered
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Whether the dog has been spayed or neutered. Must be 1 before an adoption can be finalized.`),
    IsHouseTrained: z.boolean().describe(`
        * * Field Name: IsHouseTrained
        * * Display Name: House Trained
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Whether the dog is reliably house trained.`),
    GoodWithDogs: z.boolean().nullable().describe(`
        * * Field Name: GoodWithDogs
        * * Display Name: Good With Dogs
        * * SQL Data Type: bit
        * * Description: TRI-STATE: 1 = tested and does well with other dogs, 0 = tested and does not, NULL = not yet assessed. NULL is meaningfully different from 0 and must not be treated as a no.`),
    GoodWithCats: z.boolean().nullable().describe(`
        * * Field Name: GoodWithCats
        * * Display Name: Good With Cats
        * * SQL Data Type: bit
        * * Description: TRI-STATE: 1 = tested and does well with cats, 0 = tested and does not, NULL = not yet assessed.`),
    GoodWithKids: z.boolean().nullable().describe(`
        * * Field Name: GoodWithKids
        * * Display Name: Good With Kids
        * * SQL Data Type: bit
        * * Description: TRI-STATE: 1 = tested and does well with children, 0 = tested and does not, NULL = not yet assessed.`),
    AdoptionFee: z.number().describe(`
        * * Field Name: AdoptionFee
        * * Display Name: Adoption Fee
        * * SQL Data Type: decimal(10, 2)
        * * Default Value: 0
        * * Description: Adoption fee in dollars. Typically lower for large, senior, or long-stay dogs to encourage placement.`),
    Bio: z.string().nullable().describe(`
        * * Field Name: Bio
        * * Display Name: Bio
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Public-facing narrative used on the adoption listing.`),
    PhotoURL: z.string().nullable().describe(`
        * * Field Name: PhotoURL
        * * Display Name: Photo URL
        * * SQL Data Type: nvarchar(1000)
        * * Description: URL of the primary adoption listing photo.`),
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
    Shelter: z.string().describe(`
        * * Field Name: Shelter
        * * Display Name: Shelter Name
        * * SQL Data Type: nvarchar(200)`),
    PrimaryBreed: z.string().describe(`
        * * Field Name: PrimaryBreed
        * * Display Name: Primary Breed Name
        * * SQL Data Type: nvarchar(150)`),
    SecondaryBreed: z.string().nullable().describe(`
        * * Field Name: SecondaryBreed
        * * Display Name: Secondary Breed Name
        * * SQL Data Type: nvarchar(150)`),
    Mother: z.string().nullable().describe(`
        * * Field Name: Mother
        * * Display Name: Mother Name
        * * SQL Data Type: nvarchar(100)`),
    RootMotherID: z.string().nullable().describe(`
        * * Field Name: RootMotherID
        * * Display Name: Root Mother ID
        * * SQL Data Type: uniqueidentifier`),
});

export type DogShelterDogEntityType = z.infer<typeof DogShelterDogSchema>;

/**
 * zod schema definition for the entity Foster Placements
 */
export const DogShelterFosterPlacementSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()
        * * Description: Unique identifier for the foster placement.`),
    DogID: z.string().describe(`
        * * Field Name: DogID
        * * Display Name: Dog
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Dogs (vwDogs.ID)
        * * Description: The dog placed in foster care.`),
    FosterAdopterID: z.string().describe(`
        * * Field Name: FosterAdopterID
        * * Display Name: Foster Caregiver
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Adopters (vwAdopters.ID)
        * * Description: The foster caregiver. Points at Adopter, and that person normally has IsFosterApproved = 1.`),
    StartDate: z.date().describe(`
        * * Field Name: StartDate
        * * Display Name: Start Date
        * * SQL Data Type: date
        * * Description: Date the dog went into the foster home.`),
    EndDate: z.date().nullable().describe(`
        * * Field Name: EndDate
        * * Display Name: End Date
        * * SQL Data Type: date
        * * Description: Date the placement ended. NULL while the placement is still Active. Never earlier than StartDate.`),
    Status: z.union([z.literal('Active'), z.literal('Completed'), z.literal('Ended Early')]).describe(`
        * * Field Name: Status
        * * Display Name: Placement Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Completed
    *   * Ended Early
        * * Description: State of the placement. One of: Active, Completed, Ended Early. Ended Early means the placement was cut short, usually for a behavioral or medical reason.`),
    Reason: z.string().nullable().describe(`
        * * Field Name: Reason
        * * Display Name: Placement Reason
        * * SQL Data Type: nvarchar(200)
        * * Description: Why the dog was placed in foster care, for example post-surgery recovery or kennel stress.`),
    Notes: z.string().nullable().describe(`
        * * Field Name: Notes
        * * Display Name: Foster Notes
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Notes from the foster caregiver about how the dog behaves in a home.`),
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
    Dog: z.string().describe(`
        * * Field Name: Dog
        * * Display Name: Dog Name
        * * SQL Data Type: nvarchar(100)`),
    FosterAdopter: z.string().describe(`
        * * Field Name: FosterAdopter
        * * Display Name: Foster Caregiver Name
        * * SQL Data Type: nvarchar(100)`),
});

export type DogShelterFosterPlacementEntityType = z.infer<typeof DogShelterFosterPlacementSchema>;

/**
 * zod schema definition for the entity Game Designers
 */
export const BoardGameNightGameDesignerSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()
        * * Description: Unique identifier for this game-designer link.`),
    GameID: z.string().describe(`
        * * Field Name: GameID
        * * Display Name: Game
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Games (vwGames.ID)
        * * Description: Foreign key to the Game.`),
    DesignerID: z.string().describe(`
        * * Field Name: DesignerID
        * * Display Name: Designer
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Designers (vwDesigners.ID)
        * * Description: Foreign key to the Designer.`),
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
    Game: z.string().describe(`
        * * Field Name: Game
        * * Display Name: Game Name
        * * SQL Data Type: nvarchar(255)`),
    Designer: z.string().describe(`
        * * Field Name: Designer
        * * Display Name: Designer Name
        * * SQL Data Type: nvarchar(100)`),
});

export type BoardGameNightGameDesignerEntityType = z.infer<typeof BoardGameNightGameDesignerSchema>;

/**
 * zod schema definition for the entity Games
 */
export const BoardGameNightGameSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()
        * * Description: Unique identifier for this game.`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)
        * * Description: Game title as printed on the box.`),
    PublisherID: z.string().describe(`
        * * Field Name: PublisherID
        * * Display Name: Publisher ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Publishers (vwPublishers.ID)
        * * Description: Foreign key to the Publisher that released this edition.`),
    YearPublished: z.number().nullable().describe(`
        * * Field Name: YearPublished
        * * Display Name: Year Published
        * * SQL Data Type: int
        * * Description: Year of first publication.`),
    MinPlayers: z.number().describe(`
        * * Field Name: MinPlayers
        * * Display Name: Min Players
        * * SQL Data Type: int
        * * Description: Minimum number of players supported by the rules.`),
    MaxPlayers: z.number().describe(`
        * * Field Name: MaxPlayers
        * * Display Name: Max Players
        * * SQL Data Type: int
        * * Description: Maximum number of players supported by the rules.`),
    MinPlayTimeMinutes: z.number().nullable().describe(`
        * * Field Name: MinPlayTimeMinutes
        * * Display Name: Min Play Time (Minutes)
        * * SQL Data Type: int
        * * Description: Publisher-stated minimum play time in minutes.`),
    MaxPlayTimeMinutes: z.number().nullable().describe(`
        * * Field Name: MaxPlayTimeMinutes
        * * Display Name: Max Play Time (Minutes)
        * * SQL Data Type: int
        * * Description: Publisher-stated maximum play time in minutes. Compare against PlaySession.DurationMinutes to see how badly the box lies.`),
    Weight: z.number().nullable().describe(`
        * * Field Name: Weight
        * * Display Name: Weight
        * * SQL Data Type: decimal(3, 2)
        * * Description: Complexity rating from 1.00 (lightest) to 5.00 (heaviest), BoardGameGeek style. Enforced by a range CHECK, not a value list.`),
    Category: z.union([z.literal('Abstract'), z.literal('Co-op'), z.literal('Deck Builder'), z.literal('Dexterity'), z.literal('Family'), z.literal('Legacy'), z.literal('Party'), z.literal('Strategy'), z.literal('Trivia')]).describe(`
        * * Field Name: Category
        * * Display Name: Category
        * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Abstract
    *   * Co-op
    *   * Deck Builder
    *   * Dexterity
    *   * Family
    *   * Legacy
    *   * Party
    *   * Strategy
    *   * Trivia
        * * Description: Primary game category. Constrained to a fixed list, which CodeGen turns into a dropdown.`),
    OwnershipStatus: z.union([z.literal('Loaned Out'), z.literal('Owned'), z.literal('Retired'), z.literal('Sold'), z.literal('Wishlist')]).describe(`
        * * Field Name: OwnershipStatus
        * * Display Name: Ownership Status
        * * SQL Data Type: nvarchar(30)
        * * Default Value: Owned
    * * Value List Type: List
    * * Possible Values 
    *   * Loaned Out
    *   * Owned
    *   * Retired
    *   * Sold
    *   * Wishlist
        * * Description: Current ownership state of this title. Constrained to a fixed list, which CodeGen turns into a dropdown.`),
    AcquiredDate: z.date().nullable().describe(`
        * * Field Name: AcquiredDate
        * * Display Name: Acquired Date
        * * SQL Data Type: date
        * * Description: Date the copy was acquired. Null for wishlist titles.`),
    PurchasePrice: z.number().nullable().describe(`
        * * Field Name: PurchasePrice
        * * Display Name: Purchase Price
        * * SQL Data Type: decimal(10, 2)
        * * Description: Purchase price paid, in USD. Null for wishlist titles or gifts.`),
    Notes: z.string().nullable().describe(`
        * * Field Name: Notes
        * * Display Name: Notes
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Free-form notes about this copy: expansions owned, house rules, condition.`),
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
    Publisher: z.string().describe(`
        * * Field Name: Publisher
        * * Display Name: Publisher
        * * SQL Data Type: nvarchar(200)`),
});

export type BoardGameNightGameEntityType = z.infer<typeof BoardGameNightGameSchema>;

/**
 * zod schema definition for the entity Medical Records
 */
export const DogShelterMedicalRecordSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()
        * * Description: Unique identifier for the medical record entry.`),
    DogID: z.string().describe(`
        * * Field Name: DogID
        * * Display Name: Dog
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Dogs (vwDogs.ID)
        * * Description: The dog this record belongs to.`),
    RecordDate: z.date().describe(`
        * * Field Name: RecordDate
        * * Display Name: Record Date
        * * SQL Data Type: date
        * * Description: Date the procedure or observation took place.`),
    RecordType: z.union([z.literal('Dental'), z.literal('Exam'), z.literal('Surgery'), z.literal('Test'), z.literal('Treatment'), z.literal('Vaccination')]).describe(`
        * * Field Name: RecordType
        * * Display Name: Record Type
        * * SQL Data Type: nvarchar(30)
    * * Value List Type: List
    * * Possible Values 
    *   * Dental
    *   * Exam
    *   * Surgery
    *   * Test
    *   * Treatment
    *   * Vaccination
        * * Description: Kind of medical event. One of: Vaccination, Exam, Surgery, Treatment, Test, Dental.`),
    Description: z.string().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(500)
        * * Description: Short description of what was done, for example DHPP booster or dental cleaning with two extractions.`),
    VeterinarianStaffID: z.string().nullable().describe(`
        * * Field Name: VeterinarianStaffID
        * * Display Name: Veterinarian Staff
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Staffs (vwStaffs.ID)
        * * Description: The Veterinarian or Vet Tech who performed the work. NULL for records entered from an outside clinic.`),
    Cost: z.number().describe(`
        * * Field Name: Cost
        * * Display Name: Cost
        * * SQL Data Type: decimal(10, 2)
        * * Default Value: 0
        * * Description: Cost of the procedure in dollars. Summed per dog to understand the true cost of care.`),
    FollowUpDate: z.date().nullable().describe(`
        * * Field Name: FollowUpDate
        * * Display Name: Follow-up Date
        * * SQL Data Type: date
        * * Description: Date a follow-up is due, for example the next booster. NULL when no follow-up is needed.`),
    Notes: z.string().nullable().describe(`
        * * Field Name: Notes
        * * Display Name: Notes
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Additional clinical notes.`),
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
    Dog: z.string().describe(`
        * * Field Name: Dog
        * * Display Name: Dog Name
        * * SQL Data Type: nvarchar(100)`),
    VeterinarianStaff: z.string().nullable().describe(`
        * * Field Name: VeterinarianStaff
        * * Display Name: Staff Name
        * * SQL Data Type: nvarchar(100)`),
});

export type DogShelterMedicalRecordEntityType = z.infer<typeof DogShelterMedicalRecordSchema>;

/**
 * zod schema definition for the entity Play Session Players
 */
export const BoardGameNightPlaySessionPlayerSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()
        * * Description: Unique identifier for this participation record.`),
    PlaySessionID: z.string().describe(`
        * * Field Name: PlaySessionID
        * * Display Name: Play Session
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Play Sessions (vwPlaySessions.ID)
        * * Description: Foreign key to the PlaySession.`),
    PlayerID: z.string().describe(`
        * * Field Name: PlayerID
        * * Display Name: Player
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Players (vwPlayers.ID)
        * * Description: Foreign key to the Player.`),
    Score: z.number().nullable().describe(`
        * * Field Name: Score
        * * Display Name: Score
        * * SQL Data Type: int
        * * Description: Final score for this player. Null for cooperative and abandoned sessions, where individual scores do not exist.`),
    Placement: z.number().nullable().describe(`
        * * Field Name: Placement
        * * Display Name: Placement
        * * SQL Data Type: int
        * * Description: Finishing position, 1 being first. Null for cooperative and abandoned sessions.`),
    IsWinner: z.boolean().describe(`
        * * Field Name: IsWinner
        * * Display Name: Is Winner
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Whether this player won. In a cooperative session every participant shares the same value.`),
    FactionOrColor: z.string().nullable().describe(`
        * * Field Name: FactionOrColor
        * * Display Name: Faction or Color
        * * SQL Data Type: nvarchar(100)
        * * Description: Which faction, character, spirit, or player color this player used.`),
    Notes: z.string().nullable().describe(`
        * * Field Name: Notes
        * * Display Name: Notes
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Free-form notes about this player's game.`),
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
    Player: z.string().describe(`
        * * Field Name: Player
        * * Display Name: Player Name
        * * SQL Data Type: nvarchar(100)`),
});

export type BoardGameNightPlaySessionPlayerEntityType = z.infer<typeof BoardGameNightPlaySessionPlayerSchema>;

/**
 * zod schema definition for the entity Play Sessions
 */
export const BoardGameNightPlaySessionSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()
        * * Description: Unique identifier for this play session.`),
    GameID: z.string().describe(`
        * * Field Name: GameID
        * * Display Name: Game
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Games (vwGames.ID)
        * * Description: Foreign key to the Game that was played.`),
    PlayedAt: z.date().describe(`
        * * Field Name: PlayedAt
        * * Display Name: Date Played
        * * SQL Data Type: datetime2
        * * Description: Date and time the session started.`),
    LocationName: z.string().nullable().describe(`
        * * Field Name: LocationName
        * * Display Name: Location
        * * SQL Data Type: nvarchar(200)
        * * Description: Where the session took place.`),
    DurationMinutes: z.number().nullable().describe(`
        * * Field Name: DurationMinutes
        * * Display Name: Duration (Minutes)
        * * SQL Data Type: int
        * * Description: Actual elapsed play time in minutes, including setup and teardown.`),
    Outcome: z.union([z.literal('Abandoned'), z.literal('Co-op Loss'), z.literal('Co-op Win'), z.literal('Completed')]).describe(`
        * * Field Name: Outcome
        * * Display Name: Outcome
        * * SQL Data Type: nvarchar(30)
        * * Default Value: Completed
    * * Value List Type: List
    * * Possible Values 
    *   * Abandoned
    *   * Co-op Loss
    *   * Co-op Win
    *   * Completed
        * * Description: How the session ended. Competitive games use Completed; cooperative games use Co-op Win or Co-op Loss; Abandoned means nobody finished. Constrained to a fixed list, which CodeGen turns into a dropdown.`),
    Notes: z.string().nullable().describe(`
        * * Field Name: Notes
        * * Display Name: Notes
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Free-form notes about the session: memorable plays, rules arguments, what went wrong.`),
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
    Game: z.string().describe(`
        * * Field Name: Game
        * * Display Name: Game Name
        * * SQL Data Type: nvarchar(255)`),
});

export type BoardGameNightPlaySessionEntityType = z.infer<typeof BoardGameNightPlaySessionSchema>;

/**
 * zod schema definition for the entity Players
 */
export const BoardGameNightPlayerSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()
        * * Description: Unique identifier for this player.`),
    FirstName: z.string().describe(`
        * * Field Name: FirstName
        * * Display Name: First Name
        * * SQL Data Type: nvarchar(100)
        * * Description: Player given name.`),
    LastName: z.string().describe(`
        * * Field Name: LastName
        * * Display Name: Last Name
        * * SQL Data Type: nvarchar(100)
        * * Description: Player family name.`),
    Nickname: z.string().nullable().describe(`
        * * Field Name: Nickname
        * * Display Name: Nickname
        * * SQL Data Type: nvarchar(50)
        * * Description: What everyone actually calls them at the table.`),
    Email: z.string().nullable().describe(`
        * * Field Name: Email
        * * Display Name: Email
        * * SQL Data Type: nvarchar(255)
        * * Description: Contact email address. Unique across all players.`),
    JoinedDate: z.date().nullable().describe(`
        * * Field Name: JoinedDate
        * * Display Name: Joined Date
        * * SQL Data Type: date
        * * Description: Date this player first joined the group.`),
    SkillLevel: z.union([z.literal('Casual'), z.literal('Novice'), z.literal('Regular'), z.literal('Shark')]).describe(`
        * * Field Name: SkillLevel
        * * Display Name: Skill Level
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Casual
    * * Value List Type: List
    * * Possible Values 
    *   * Casual
    *   * Novice
    *   * Regular
    *   * Shark
        * * Description: Self-reported experience level. Constrained to a fixed list, which CodeGen turns into a dropdown.`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: Whether this player still attends. Inactive players are retained so historical sessions stay intact.`),
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

export type BoardGameNightPlayerEntityType = z.infer<typeof BoardGameNightPlayerSchema>;

/**
 * zod schema definition for the entity Publishers
 */
export const BoardGameNightPublisherSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()
        * * Description: Unique identifier for this publisher.`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(200)
        * * Description: Company name as it appears on the box. Unique across all publishers.`),
    FoundedYear: z.number().nullable().describe(`
        * * Field Name: FoundedYear
        * * Display Name: Founded Year
        * * SQL Data Type: int
        * * Description: Year the company was founded.`),
    Country: z.string().nullable().describe(`
        * * Field Name: Country
        * * Display Name: Country
        * * SQL Data Type: nvarchar(100)
        * * Description: Country where the publisher is headquartered.`),
    Website: z.string().nullable().describe(`
        * * Field Name: Website
        * * Display Name: Website
        * * SQL Data Type: nvarchar(500)
        * * Description: Publisher website URL.`),
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

export type BoardGameNightPublisherEntityType = z.infer<typeof BoardGameNightPublisherSchema>;

/**
 * zod schema definition for the entity Shelters
 */
export const DogShelterShelterSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()
        * * Description: Unique identifier for the shelter location.`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(200)
        * * Description: Public-facing name of the shelter. Unique across all locations.`),
    AddressLine1: z.string().nullable().describe(`
        * * Field Name: AddressLine1
        * * Display Name: Address Line 1
        * * SQL Data Type: nvarchar(200)
        * * Description: Street address of the shelter.`),
    City: z.string().describe(`
        * * Field Name: City
        * * Display Name: City
        * * SQL Data Type: nvarchar(100)
        * * Description: City where the shelter is located.`),
    State: z.string().describe(`
        * * Field Name: State
        * * Display Name: State
        * * SQL Data Type: nvarchar(50)
        * * Description: State or province where the shelter is located.`),
    PostalCode: z.string().nullable().describe(`
        * * Field Name: PostalCode
        * * Display Name: Postal Code
        * * SQL Data Type: nvarchar(20)
        * * Description: Postal or ZIP code of the shelter address.`),
    Phone: z.string().nullable().describe(`
        * * Field Name: Phone
        * * Display Name: Phone
        * * SQL Data Type: nvarchar(50)
        * * Description: Main public phone number for adoption inquiries.`),
    Email: z.string().nullable().describe(`
        * * Field Name: Email
        * * Display Name: Email
        * * SQL Data Type: nvarchar(255)
        * * Description: General contact email address for the shelter.`),
    KennelCapacity: z.number().describe(`
        * * Field Name: KennelCapacity
        * * Display Name: Kennel Capacity
        * * SQL Data Type: int
        * * Default Value: 40
        * * Description: Maximum number of dogs the shelter can physically house at one time. Used as the denominator when calculating occupancy.`),
    OpenedDate: z.date().nullable().describe(`
        * * Field Name: OpenedDate
        * * Display Name: Opened Date
        * * SQL Data Type: date
        * * Description: Date this shelter location opened.`),
    IsAcceptingIntakes: z.boolean().describe(`
        * * Field Name: IsAcceptingIntakes
        * * Display Name: Accepting Intakes
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: When 0, the shelter is at or over capacity and is temporarily refusing new intakes.`),
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

export type DogShelterShelterEntityType = z.infer<typeof DogShelterShelterSchema>;

/**
 * zod schema definition for the entity Staffs
 */
export const DogShelterStaffSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()
        * * Description: Unique identifier for the staff member.`),
    ShelterID: z.string().describe(`
        * * Field Name: ShelterID
        * * Display Name: Shelter ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Shelters (vwShelters.ID)
        * * Description: The shelter location this person works at.`),
    FirstName: z.string().describe(`
        * * Field Name: FirstName
        * * Display Name: First Name
        * * SQL Data Type: nvarchar(100)
        * * Description: Given name of the staff member.`),
    LastName: z.string().describe(`
        * * Field Name: LastName
        * * Display Name: Last Name
        * * SQL Data Type: nvarchar(100)
        * * Description: Family name of the staff member.`),
    FullName: z.string().describe(`
        * * Field Name: FullName
        * * Display Name: Full Name
        * * SQL Data Type: nvarchar(201)
        * * Description: PERSISTED computed column: FirstName plus a space plus LastName. Read-only. Serves as the human-readable display value wherever a staff member is referenced.`),
    Email: z.string().describe(`
        * * Field Name: Email
        * * Display Name: Email
        * * SQL Data Type: nvarchar(255)
        * * Description: Work email address. Unique across all staff.`),
    Phone: z.string().nullable().describe(`
        * * Field Name: Phone
        * * Display Name: Phone
        * * SQL Data Type: nvarchar(50)
        * * Description: Contact phone number for the staff member.`),
    Role: z.union([z.literal('Adoption Counselor'), z.literal('Kennel Attendant'), z.literal('Shelter Manager'), z.literal('Vet Tech'), z.literal('Veterinarian'), z.literal('Volunteer'), z.literal('Volunteer Coordinator')]).describe(`
        * * Field Name: Role
        * * Display Name: Role
        * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Adoption Counselor
    *   * Kennel Attendant
    *   * Shelter Manager
    *   * Vet Tech
    *   * Veterinarian
    *   * Volunteer
    *   * Volunteer Coordinator
        * * Description: Job function. One of: Shelter Manager, Adoption Counselor, Veterinarian, Vet Tech, Kennel Attendant, Volunteer Coordinator, Volunteer. Only Veterinarian and Vet Tech records appear as the vet on a medical record.`),
    HireDate: z.date().describe(`
        * * Field Name: HireDate
        * * Display Name: Hire Date
        * * SQL Data Type: date
        * * Description: Date the person started working or volunteering at the shelter.`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: When 0, the person no longer works at the shelter. Historical records still reference them, so rows are deactivated rather than deleted.`),
    SupervisorID: z.string().nullable().describe(`
        * * Field Name: SupervisorID
        * * Display Name: Supervisor ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Staffs (vwStaffs.ID)
        * * Description: SELF-REFERENCING foreign key to the staff member this person reports to. NULL for the shelter manager at the top of each location hierarchy.`),
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
    Shelter: z.string().describe(`
        * * Field Name: Shelter
        * * Display Name: Shelter
        * * SQL Data Type: nvarchar(200)`),
    Supervisor: z.string().nullable().describe(`
        * * Field Name: Supervisor
        * * Display Name: Supervisor
        * * SQL Data Type: nvarchar(100)`),
    RootSupervisorID: z.string().nullable().describe(`
        * * Field Name: RootSupervisorID
        * * Display Name: Root Supervisor ID
        * * SQL Data Type: uniqueidentifier`),
});

export type DogShelterStaffEntityType = z.infer<typeof DogShelterStaffSchema>;

/**
 * zod schema definition for the entity Traits
 */
export const DogShelterTraitSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()
        * * Description: Unique identifier for the trait.`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(100)
        * * Description: Short label shown as a tag on the dog record, for example Loves Car Rides.`),
    Category: z.union([z.literal('Activity'), z.literal('Special Needs'), z.literal('Temperament'), z.literal('Training')]).describe(`
        * * Field Name: Category
        * * Display Name: Category
        * * SQL Data Type: nvarchar(30)
    * * Value List Type: List
    * * Possible Values 
    *   * Activity
    *   * Special Needs
    *   * Temperament
    *   * Training
        * * Description: Grouping for the trait. One of: Temperament, Training, Special Needs, Activity.`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(500)
        * * Description: Explanation of what the trait means and how staff should apply it.`),
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

export type DogShelterTraitEntityType = z.infer<typeof DogShelterTraitSchema>;
 
 

/**
 * Adopters - strongly typed entity sub-class
 * * Schema: DogShelter
 * * Base Table: Adopter
 * * Base View: vwAdopters
 * * @description People who adopt or foster dogs. The same person can appear on adoption applications and on foster placements, which is why Dog and Adopter have two distinct relationships to each other.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Adopters')
export class DogShelterAdopterEntity extends BaseEntity<DogShelterAdopterEntityType> {
    /**
    * Loads the Adopters record from the database
    * @param ID: string - primary key value to load the Adopters record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof DogShelterAdopterEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for Adopters entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * Table-Level: A household must contain at least one adult and cannot have a negative number of children.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateHouseholdAdultsAndChildren(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * A household must contain at least one adult and cannot have a negative number of children.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateHouseholdAdultsAndChildren(result: ValidationResult) {
    	if (this.HouseholdAdults !== undefined && this.HouseholdAdults !== null && this.HouseholdAdults < 1) {
    		result.Errors.push(new ValidationErrorInfo(
    			"HouseholdAdults",
    			"There must be at least one adult in the household.",
    			this.HouseholdAdults,
    			ValidationErrorType.Failure
    		));
    	}
    	if (this.HouseholdChildren !== undefined && this.HouseholdChildren !== null && this.HouseholdChildren < 0) {
    		result.Errors.push(new ValidationErrorInfo(
    			"HouseholdChildren",
    			"The number of children cannot be less than zero.",
    			this.HouseholdChildren,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    * * Description: Unique identifier for the adopter.
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: FirstName
    * * Display Name: First Name
    * * SQL Data Type: nvarchar(100)
    * * Description: Given name of the adopter.
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
    * * SQL Data Type: nvarchar(100)
    * * Description: Family name of the adopter.
    */
    get LastName(): string {
        return this.Get('LastName');
    }
    set LastName(value: string) {
        this.Set('LastName', value);
    }

    /**
    * * Field Name: FullName
    * * Display Name: Full Name
    * * SQL Data Type: nvarchar(201)
    * * Description: PERSISTED computed column: FirstName plus a space plus LastName. Read-only display value.
    */
    get FullName(): string {
        return this.Get('FullName');
    }

    /**
    * * Field Name: Email
    * * Display Name: Email
    * * SQL Data Type: nvarchar(255)
    * * Description: Primary email address. Unique - the shelter uses it to detect repeat applicants.
    */
    get Email(): string {
        return this.Get('Email');
    }
    set Email(value: string) {
        this.Set('Email', value);
    }

    /**
    * * Field Name: Phone
    * * Display Name: Phone
    * * SQL Data Type: nvarchar(50)
    * * Description: Contact phone number for the adopter.
    */
    get Phone(): string | null {
        return this.Get('Phone');
    }
    set Phone(value: string | null) {
        this.Set('Phone', value);
    }

    /**
    * * Field Name: AddressLine1
    * * Display Name: Address Line 1
    * * SQL Data Type: nvarchar(200)
    * * Description: Home street address, used for home visits.
    */
    get AddressLine1(): string | null {
        return this.Get('AddressLine1');
    }
    set AddressLine1(value: string | null) {
        this.Set('AddressLine1', value);
    }

    /**
    * * Field Name: City
    * * Display Name: City
    * * SQL Data Type: nvarchar(100)
    * * Description: City of the adopter home address.
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
    * * SQL Data Type: nvarchar(50)
    * * Description: State or province of the adopter home address.
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
    * * SQL Data Type: nvarchar(20)
    * * Description: Postal or ZIP code of the adopter home address.
    */
    get PostalCode(): string | null {
        return this.Get('PostalCode');
    }
    set PostalCode(value: string | null) {
        this.Set('PostalCode', value);
    }

    /**
    * * Field Name: HousingType
    * * Display Name: Housing Type
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Apartment
    *   * Condo
    *   * Farm
    *   * House
    *   * Townhouse
    * * Description: Type of home. One of: House, Apartment, Condo, Townhouse, Farm. Combined with HasFencedYard when matching high-energy dogs.
    */
    get HousingType(): 'Apartment' | 'Condo' | 'Farm' | 'House' | 'Townhouse' {
        return this.Get('HousingType');
    }
    set HousingType(value: 'Apartment' | 'Condo' | 'Farm' | 'House' | 'Townhouse') {
        this.Set('HousingType', value);
    }

    /**
    * * Field Name: HasFencedYard
    * * Display Name: Has Fenced Yard
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Whether the property has a securely fenced yard. Required for some dogs.
    */
    get HasFencedYard(): boolean {
        return this.Get('HasFencedYard');
    }
    set HasFencedYard(value: boolean) {
        this.Set('HasFencedYard', value);
    }

    /**
    * * Field Name: HasOtherPets
    * * Display Name: Has Other Pets
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Whether the household already has other pets. Relevant to dogs flagged GoodWithDogs or GoodWithCats = 0.
    */
    get HasOtherPets(): boolean {
        return this.Get('HasOtherPets');
    }
    set HasOtherPets(value: boolean) {
        this.Set('HasOtherPets', value);
    }

    /**
    * * Field Name: HouseholdAdults
    * * Display Name: Household Adults
    * * SQL Data Type: int
    * * Default Value: 1
    * * Description: Number of adults living in the household.
    */
    get HouseholdAdults(): number {
        return this.Get('HouseholdAdults');
    }
    set HouseholdAdults(value: number) {
        this.Set('HouseholdAdults', value);
    }

    /**
    * * Field Name: HouseholdChildren
    * * Display Name: Household Children
    * * SQL Data Type: int
    * * Default Value: 0
    * * Description: Number of children living in the household. Relevant to dogs flagged GoodWithKids = 0.
    */
    get HouseholdChildren(): number {
        return this.Get('HouseholdChildren');
    }
    set HouseholdChildren(value: number) {
        this.Set('HouseholdChildren', value);
    }

    /**
    * * Field Name: IsFosterApproved
    * * Display Name: Is Foster Approved
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Whether this person has completed foster training and may take foster placements.
    */
    get IsFosterApproved(): boolean {
        return this.Get('IsFosterApproved');
    }
    set IsFosterApproved(value: boolean) {
        this.Set('IsFosterApproved', value);
    }

    /**
    * * Field Name: DateRegistered
    * * Display Name: Date Registered
    * * SQL Data Type: date
    * * Description: Date the person first registered with the shelter.
    */
    get DateRegistered(): Date {
        return this.Get('DateRegistered');
    }
    set DateRegistered(value: Date) {
        this.Set('DateRegistered', value);
    }

    /**
    * * Field Name: Notes
    * * Display Name: Notes
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Free-form staff notes about the adopter.
    */
    get Notes(): string | null {
        return this.Get('Notes');
    }
    set Notes(value: string | null) {
        this.Set('Notes', value);
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


/**
 * Adoption Applications - strongly typed entity sub-class
 * * Schema: DogShelter
 * * Base Table: AdoptionApplication
 * * Base View: vwAdoptionApplications
 * * @description An application by one adopter to adopt one dog, with the review workflow attached. This is the FIRST of two many-to-many relationships between Dog and Adopter; the other is FosterPlacement.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Adoption Applications')
export class DogShelterAdoptionApplicationEntity extends BaseEntity<DogShelterAdoptionApplicationEntityType> {
    /**
    * Loads the Adoption Applications record from the database
    * @param ID: string - primary key value to load the Adoption Applications record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof DogShelterAdoptionApplicationEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for Adoption Applications entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * FeePaid: The fee paid for the adoption cannot be negative. If a fee is recorded, it must be zero or a positive amount.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateFeePaidIsNotNegative(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * The fee paid for the adoption cannot be negative. If a fee is recorded, it must be zero or a positive amount.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateFeePaidIsNotNegative(result: ValidationResult) {
    	if (this.FeePaid != null && this.FeePaid < 0) {
    		result.Errors.push(new ValidationErrorInfo(
    			"FeePaid",
    			"The fee paid cannot be a negative value. Please enter zero or a positive amount.",
    			this.FeePaid,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    * * Description: Unique identifier for the application.
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: DogID
    * * Display Name: Dog
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Dogs (vwDogs.ID)
    * * Description: The dog being applied for. A dog can receive several competing applications.
    */
    get DogID(): string {
        return this.Get('DogID');
    }
    set DogID(value: string) {
        this.Set('DogID', value);
    }

    /**
    * * Field Name: AdopterID
    * * Display Name: Adopter
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Adopters (vwAdopters.ID)
    * * Description: The person applying.
    */
    get AdopterID(): string {
        return this.Get('AdopterID');
    }
    set AdopterID(value: string) {
        this.Set('AdopterID', value);
    }

    /**
    * * Field Name: SubmittedAt
    * * Display Name: Submitted At
    * * SQL Data Type: datetimeoffset
    * * Description: When the application was submitted.
    */
    get SubmittedAt(): Date {
        return this.Get('SubmittedAt');
    }
    set SubmittedAt(value: Date) {
        this.Set('SubmittedAt', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(30)
    * * Default Value: Submitted
    * * Value List Type: List
    * * Possible Values 
    *   * Approved
    *   * Completed
    *   * Denied
    *   * Submitted
    *   * Under Review
    *   * Withdrawn
    * * Description: Workflow state. One of: Submitted, Under Review, Approved, Denied, Withdrawn, Completed. Completed means the adoption actually happened and AdoptionDate is set.
    */
    get Status(): 'Approved' | 'Completed' | 'Denied' | 'Submitted' | 'Under Review' | 'Withdrawn' {
        return this.Get('Status');
    }
    set Status(value: 'Approved' | 'Completed' | 'Denied' | 'Submitted' | 'Under Review' | 'Withdrawn') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: ReviewedByStaffID
    * * Display Name: Reviewed By Staff
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Staffs (vwStaffs.ID)
    * * Description: The staff member who reviewed the application, normally an Adoption Counselor. NULL while the application is still unreviewed.
    */
    get ReviewedByStaffID(): string | null {
        return this.Get('ReviewedByStaffID');
    }
    set ReviewedByStaffID(value: string | null) {
        this.Set('ReviewedByStaffID', value);
    }

    /**
    * * Field Name: ReviewedAt
    * * Display Name: Reviewed At
    * * SQL Data Type: datetimeoffset
    * * Description: When the review decision was recorded.
    */
    get ReviewedAt(): Date | null {
        return this.Get('ReviewedAt');
    }
    set ReviewedAt(value: Date | null) {
        this.Set('ReviewedAt', value);
    }

    /**
    * * Field Name: HomeVisitDate
    * * Display Name: Home Visit Date
    * * SQL Data Type: date
    * * Description: Date of the in-home visit, where the process requires one.
    */
    get HomeVisitDate(): Date | null {
        return this.Get('HomeVisitDate');
    }
    set HomeVisitDate(value: Date | null) {
        this.Set('HomeVisitDate', value);
    }

    /**
    * * Field Name: DecisionNotes
    * * Display Name: Decision Notes
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Staff rationale for the approval or denial.
    */
    get DecisionNotes(): string | null {
        return this.Get('DecisionNotes');
    }
    set DecisionNotes(value: string | null) {
        this.Set('DecisionNotes', value);
    }

    /**
    * * Field Name: AdoptionDate
    * * Display Name: Adoption Date
    * * SQL Data Type: date
    * * Description: Date the adoption was finalized. Set only on Completed applications and matches the OutcomeDate on the dog.
    */
    get AdoptionDate(): Date | null {
        return this.Get('AdoptionDate');
    }
    set AdoptionDate(value: Date | null) {
        this.Set('AdoptionDate', value);
    }

    /**
    * * Field Name: FeePaid
    * * Display Name: Fee Paid
    * * SQL Data Type: decimal(10, 2)
    * * Description: Adoption fee actually collected, which may differ from the listed fee after a waiver or promotion.
    */
    get FeePaid(): number | null {
        return this.Get('FeePaid');
    }
    set FeePaid(value: number | null) {
        this.Set('FeePaid', value);
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
    * * Field Name: Dog
    * * Display Name: Dog Name
    * * SQL Data Type: nvarchar(100)
    */
    get Dog(): string {
        return this.Get('Dog');
    }

    /**
    * * Field Name: Adopter
    * * Display Name: Adopter Name
    * * SQL Data Type: nvarchar(100)
    */
    get Adopter(): string {
        return this.Get('Adopter');
    }

    /**
    * * Field Name: ReviewedByStaff
    * * Display Name: Reviewer Name
    * * SQL Data Type: nvarchar(100)
    */
    get ReviewedByStaff(): string | null {
        return this.Get('ReviewedByStaff');
    }
}


/**
 * Breeds - strongly typed entity sub-class
 * * Schema: DogShelter
 * * Base Table: Breed
 * * Base View: vwBreeds
 * * @description Reference list of dog breeds with typical size, energy, and grooming characteristics. Referenced twice by Dog - once as primary breed and once as secondary breed for mixes.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Breeds')
export class DogShelterBreedEntity extends BaseEntity<DogShelterBreedEntityType> {
    /**
    * Loads the Breeds record from the database
    * @param ID: string - primary key value to load the Breeds record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof DogShelterBreedEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for Breeds entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * Table-Level: The high end of the typical weight range must be greater than or equal to the low end of the typical weight range.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateTypicalWeightRange(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * The high end of the typical weight range must be greater than or equal to the low end of the typical weight range.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateTypicalWeightRange(result: ValidationResult) {
    	if (this.TypicalWeightLbsHigh != null && this.TypicalWeightLbsLow != null) {
    		if (this.TypicalWeightLbsHigh < this.TypicalWeightLbsLow) {
    			result.Errors.push(new ValidationErrorInfo(
    				"TypicalWeightLbsHigh",
    				"The high typical weight (" + this.TypicalWeightLbsHigh + " lbs) must be greater than or equal to the low typical weight (" + this.TypicalWeightLbsLow + " lbs).",
    				this.TypicalWeightLbsHigh,
    				ValidationErrorType.Failure
    			));
    		}
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    * * Description: Unique identifier for the breed.
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Breed Name
    * * SQL Data Type: nvarchar(150)
    * * Description: Common name of the breed, for example Labrador Retriever. Includes a Mixed Breed entry for dogs of unknown ancestry.
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: SizeCategory
    * * Display Name: Size Category
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Giant
    *   * Large
    *   * Medium
    *   * Small
    *   * Toy
    * * Description: Size class of the breed. One of: Toy, Small, Medium, Large, Giant.
    */
    get SizeCategory(): 'Giant' | 'Large' | 'Medium' | 'Small' | 'Toy' {
        return this.Get('SizeCategory');
    }
    set SizeCategory(value: 'Giant' | 'Large' | 'Medium' | 'Small' | 'Toy') {
        this.Set('SizeCategory', value);
    }

    /**
    * * Field Name: TypicalWeightLbsLow
    * * Display Name: Typical Weight (Low)
    * * SQL Data Type: int
    * * Description: Low end of the typical healthy adult weight range, in pounds.
    */
    get TypicalWeightLbsLow(): number | null {
        return this.Get('TypicalWeightLbsLow');
    }
    set TypicalWeightLbsLow(value: number | null) {
        this.Set('TypicalWeightLbsLow', value);
    }

    /**
    * * Field Name: TypicalWeightLbsHigh
    * * Display Name: Typical Weight (High)
    * * SQL Data Type: int
    * * Description: High end of the typical healthy adult weight range, in pounds. Always greater than or equal to TypicalWeightLbsLow.
    */
    get TypicalWeightLbsHigh(): number | null {
        return this.Get('TypicalWeightLbsHigh');
    }
    set TypicalWeightLbsHigh(value: number | null) {
        this.Set('TypicalWeightLbsHigh', value);
    }

    /**
    * * Field Name: EnergyLevel
    * * Display Name: Energy Level
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * High
    *   * Low
    *   * Moderate
    *   * Very High
    * * Description: How much daily exercise the breed typically needs. One of: Low, Moderate, High, Very High. Adoption counselors use this to match dogs to households.
    */
    get EnergyLevel(): 'High' | 'Low' | 'Moderate' | 'Very High' {
        return this.Get('EnergyLevel');
    }
    set EnergyLevel(value: 'High' | 'Low' | 'Moderate' | 'Very High') {
        this.Set('EnergyLevel', value);
    }

    /**
    * * Field Name: GroomingNeeds
    * * Display Name: Grooming Needs
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * High
    *   * Minimal
    *   * Moderate
    * * Description: Typical grooming burden for the breed. One of: Minimal, Moderate, High.
    */
    get GroomingNeeds(): 'High' | 'Minimal' | 'Moderate' {
        return this.Get('GroomingNeeds');
    }
    set GroomingNeeds(value: 'High' | 'Minimal' | 'Moderate') {
        this.Set('GroomingNeeds', value);
    }

    /**
    * * Field Name: TypicalLifespanYears
    * * Display Name: Typical Lifespan (Years)
    * * SQL Data Type: int
    * * Description: Typical lifespan of the breed in years.
    */
    get TypicalLifespanYears(): number | null {
        return this.Get('TypicalLifespanYears');
    }
    set TypicalLifespanYears(value: number | null) {
        this.Set('TypicalLifespanYears', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(1000)
    * * Description: Narrative description of the breed temperament and typical care needs.
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
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


/**
 * Designers - strongly typed entity sub-class
 * * Schema: BoardGameNight
 * * Base Table: Designer
 * * Base View: vwDesigners
 * * @description A person who designs board games. Linked to Game through the GameDesigner junction table in a many-to-many relationship.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Designers')
export class BoardGameNightDesignerEntity extends BaseEntity<BoardGameNightDesignerEntityType> {
    /**
    * Loads the Designers record from the database
    * @param ID: string - primary key value to load the Designers record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof BoardGameNightDesignerEntity
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
    * * Description: Unique identifier for this designer.
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: FirstName
    * * Display Name: First Name
    * * SQL Data Type: nvarchar(100)
    * * Description: Designer given name.
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
    * * SQL Data Type: nvarchar(100)
    * * Description: Designer family name.
    */
    get LastName(): string {
        return this.Get('LastName');
    }
    set LastName(value: string) {
        this.Set('LastName', value);
    }

    /**
    * * Field Name: Bio
    * * Display Name: Biography
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Short biography or notable design credits.
    */
    get Bio(): string | null {
        return this.Get('Bio');
    }
    set Bio(value: string | null) {
        this.Set('Bio', value);
    }

    /**
    * * Field Name: Website
    * * Display Name: Website
    * * SQL Data Type: nvarchar(500)
    * * Description: Designer personal or studio website URL.
    */
    get Website(): string | null {
        return this.Get('Website');
    }
    set Website(value: string | null) {
        this.Set('Website', value);
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


/**
 * Dog Traits - strongly typed entity sub-class
 * * Schema: DogShelter
 * * Base Table: DogTrait
 * * Base View: vwDogTraits
 * * @description PURE JUNCTION TABLE joining Dog and Trait. Each row means one dog has been tagged with one trait. The unique constraint on DogID plus TraitID prevents the same tag being applied twice.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Dog Traits')
export class DogShelterDogTraitEntity extends BaseEntity<DogShelterDogTraitEntityType> {
    /**
    * Loads the Dog Traits record from the database
    * @param ID: string - primary key value to load the Dog Traits record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof DogShelterDogTraitEntity
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
    * * Description: Unique identifier for the dog-trait assignment.
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: DogID
    * * Display Name: Dog
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Dogs (vwDogs.ID)
    * * Description: The dog being tagged.
    */
    get DogID(): string {
        return this.Get('DogID');
    }
    set DogID(value: string) {
        this.Set('DogID', value);
    }

    /**
    * * Field Name: TraitID
    * * Display Name: Trait
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Traits (vwTraits.ID)
    * * Description: The trait being applied.
    */
    get TraitID(): string {
        return this.Get('TraitID');
    }
    set TraitID(value: string) {
        this.Set('TraitID', value);
    }

    /**
    * * Field Name: AssignedByStaffID
    * * Display Name: Assigned By Staff
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Staffs (vwStaffs.ID)
    * * Description: The staff member who observed and recorded the trait.
    */
    get AssignedByStaffID(): string | null {
        return this.Get('AssignedByStaffID');
    }
    set AssignedByStaffID(value: string | null) {
        this.Set('AssignedByStaffID', value);
    }

    /**
    * * Field Name: AssignedAt
    * * Display Name: Assigned At
    * * SQL Data Type: datetimeoffset
    * * Default Value: sysdatetimeoffset()
    * * Description: When the trait was assigned.
    */
    get AssignedAt(): Date {
        return this.Get('AssignedAt');
    }
    set AssignedAt(value: Date) {
        this.Set('AssignedAt', value);
    }

    /**
    * * Field Name: Notes
    * * Display Name: Notes
    * * SQL Data Type: nvarchar(500)
    * * Description: Context for the tag, for example the specific situation where the behavior was observed.
    */
    get Notes(): string | null {
        return this.Get('Notes');
    }
    set Notes(value: string | null) {
        this.Set('Notes', value);
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
    * * Field Name: Dog
    * * Display Name: Dog Name
    * * SQL Data Type: nvarchar(100)
    */
    get Dog(): string {
        return this.Get('Dog');
    }

    /**
    * * Field Name: Trait
    * * Display Name: Trait Name
    * * SQL Data Type: nvarchar(100)
    */
    get Trait(): string {
        return this.Get('Trait');
    }

    /**
    * * Field Name: AssignedByStaff
    * * Display Name: Assigned By Staff Name
    * * SQL Data Type: nvarchar(100)
    */
    get AssignedByStaff(): string | null {
        return this.Get('AssignedByStaff');
    }
}


/**
 * Dogs - strongly typed entity sub-class
 * * Schema: DogShelter
 * * Base Table: Dog
 * * Base View: vwDogs
 * * @description The central entity of the shelter. One row per dog in the care of the organization, past or present. A dog stays in this table after adoption - Status and OutcomeDate record what happened rather than the row being deleted.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Dogs')
export class DogShelterDogEntity extends BaseEntity<DogShelterDogEntityType> {
    /**
    * Loads the Dogs record from the database
    * @param ID: string - primary key value to load the Dogs record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof DogShelterDogEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for Dogs entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * AdoptionFee: The adoption fee must be greater than or equal to zero. Negative adoption fees are not allowed.
    * * Table-Level: The outcome date must be on or after the intake date. This ensures that an animal's departure is not recorded as occurring before its arrival.
    * * Table-Level: The secondary breed of an animal cannot be the same as its primary breed to prevent redundant breed classification.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateAdoptionFeeIsNonNegative(result);
        this.ValidateOutcomeDateAfterOrEqualIntakeDate(result);
        this.ValidateSecondaryBreedIDNotEqualToPrimaryBreedID(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * The adoption fee must be greater than or equal to zero. Negative adoption fees are not allowed.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateAdoptionFeeIsNonNegative(result: ValidationResult) {
    	if (this.AdoptionFee != null && this.AdoptionFee < 0) {
    		result.Errors.push(new ValidationErrorInfo(
    			"AdoptionFee",
    			"The adoption fee must be greater than or equal to zero.",
    			this.AdoptionFee,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * The outcome date must be on or after the intake date. This ensures that an animal's departure is not recorded as occurring before its arrival.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateOutcomeDateAfterOrEqualIntakeDate(result: ValidationResult) {
    	if (this.OutcomeDate != null && this.IntakeDate != null) {
    		const outcome = new Date(this.OutcomeDate);
    		const intake = new Date(this.IntakeDate);
    		if (outcome < intake) {
    			result.Errors.push(new ValidationErrorInfo(
    				"OutcomeDate",
    				"The outcome date cannot be earlier than the intake date.",
    				this.OutcomeDate,
    				ValidationErrorType.Failure
    			));
    		}
    	}
    }

    /**
    * The secondary breed of an animal cannot be the same as its primary breed to prevent redundant breed classification.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateSecondaryBreedIDNotEqualToPrimaryBreedID(result: ValidationResult) {
    	if (this.SecondaryBreedID != null && this.SecondaryBreedID === this.PrimaryBreedID) {
    		result.Errors.push(new ValidationErrorInfo(
    			"SecondaryBreedID",
    			"The secondary breed cannot be the same as the primary breed.",
    			this.SecondaryBreedID,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    * * Description: Unique identifier for the dog.
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(100)
    * * Description: Name the shelter uses for the dog. Assigned by staff on intake for strays.
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: ShelterID
    * * Display Name: Shelter
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Shelters (vwShelters.ID)
    * * Description: The shelter location currently responsible for this dog.
    */
    get ShelterID(): string {
        return this.Get('ShelterID');
    }
    set ShelterID(value: string) {
        this.Set('ShelterID', value);
    }

    /**
    * * Field Name: PrimaryBreedID
    * * Display Name: Primary Breed
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Breeds (vwBreeds.ID)
    * * Description: Best-guess primary breed. One of TWO foreign keys from this table to Breed - see also SecondaryBreedID.
    */
    get PrimaryBreedID(): string {
        return this.Get('PrimaryBreedID');
    }
    set PrimaryBreedID(value: string) {
        this.Set('PrimaryBreedID', value);
    }

    /**
    * * Field Name: SecondaryBreedID
    * * Display Name: Secondary Breed
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Breeds (vwBreeds.ID)
    * * Description: Second breed for a mixed-breed dog, or NULL if the dog appears purebred or the mix is unknown. The SECOND foreign key from this table to Breed. Always different from PrimaryBreedID.
    */
    get SecondaryBreedID(): string | null {
        return this.Get('SecondaryBreedID');
    }
    set SecondaryBreedID(value: string | null) {
        this.Set('SecondaryBreedID', value);
    }

    /**
    * * Field Name: MotherID
    * * Display Name: Mother
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Dogs (vwDogs.ID)
    * * Description: SELF-REFERENCING foreign key to the mother of this dog, populated only for puppies born in shelter care. NULL for every dog that arrived from outside.
    */
    get MotherID(): string | null {
        return this.Get('MotherID');
    }
    set MotherID(value: string | null) {
        this.Set('MotherID', value);
    }

    /**
    * * Field Name: Sex
    * * Display Name: Sex
    * * SQL Data Type: nvarchar(10)
    * * Value List Type: List
    * * Possible Values 
    *   * Female
    *   * Male
    * * Description: Sex of the dog. One of: Male, Female.
    */
    get Sex(): 'Female' | 'Male' {
        return this.Get('Sex');
    }
    set Sex(value: 'Female' | 'Male') {
        this.Set('Sex', value);
    }

    /**
    * * Field Name: EstimatedBirthDate
    * * Display Name: Estimated Birth Date
    * * SQL Data Type: date
    * * Description: Estimated date of birth. For strays this is a veterinary estimate from dentition, not a known date.
    */
    get EstimatedBirthDate(): Date | null {
        return this.Get('EstimatedBirthDate');
    }
    set EstimatedBirthDate(value: Date | null) {
        this.Set('EstimatedBirthDate', value);
    }

    /**
    * * Field Name: EstimatedAgeMonths
    * * Display Name: Estimated Age (Months)
    * * SQL Data Type: int
    * * Description: COMPUTED, NOT PERSISTED: whole months between EstimatedBirthDate and today. Read-only and recalculated on every read, so it cannot be indexed.
    */
    get EstimatedAgeMonths(): number | null {
        return this.Get('EstimatedAgeMonths');
    }

    /**
    * * Field Name: WeightLbs
    * * Display Name: Weight (Lbs)
    * * SQL Data Type: decimal(6, 2)
    * * Description: Most recent recorded weight in pounds.
    */
    get WeightLbs(): number | null {
        return this.Get('WeightLbs');
    }
    set WeightLbs(value: number | null) {
        this.Set('WeightLbs', value);
    }

    /**
    * * Field Name: Color
    * * Display Name: Color
    * * SQL Data Type: nvarchar(100)
    * * Description: Coat color and pattern as described by staff, for example Black and White or Brindle.
    */
    get Color(): string | null {
        return this.Get('Color');
    }
    set Color(value: string | null) {
        this.Set('Color', value);
    }

    /**
    * * Field Name: MicrochipNumber
    * * Display Name: Microchip Number
    * * SQL Data Type: nvarchar(50)
    * * Description: Implanted microchip number. Unique when present, NULL for dogs not yet chipped.
    */
    get MicrochipNumber(): string | null {
        return this.Get('MicrochipNumber');
    }
    set MicrochipNumber(value: string | null) {
        this.Set('MicrochipNumber', value);
    }

    /**
    * * Field Name: IntakeDate
    * * Display Name: Intake Date
    * * SQL Data Type: date
    * * Description: Date the dog entered the care of the shelter. The clock that length-of-stay is measured from.
    */
    get IntakeDate(): Date {
        return this.Get('IntakeDate');
    }
    set IntakeDate(value: Date) {
        this.Set('IntakeDate', value);
    }

    /**
    * * Field Name: IntakeType
    * * Display Name: Intake Type
    * * SQL Data Type: nvarchar(30)
    * * Value List Type: List
    * * Possible Values 
    *   * Born In Care
    *   * Owner Surrender
    *   * Return
    *   * Stray
    *   * Transfer
    * * Description: How the dog arrived. One of: Stray, Owner Surrender, Transfer, Born In Care, Return. Return means a previously adopted dog came back.
    */
    get IntakeType(): 'Born In Care' | 'Owner Surrender' | 'Return' | 'Stray' | 'Transfer' {
        return this.Get('IntakeType');
    }
    set IntakeType(value: 'Born In Care' | 'Owner Surrender' | 'Return' | 'Stray' | 'Transfer') {
        this.Set('IntakeType', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(30)
    * * Default Value: Intake
    * * Value List Type: List
    * * Possible Values 
    *   * Adopted
    *   * Available
    *   * Fostered
    *   * Intake
    *   * Medical Hold
    *   * Pending
    *   * Transferred
    * * Description: Current disposition. One of: Intake, Available, Pending, Fostered, Medical Hold, Adopted, Transferred. Only Available dogs are shown to the public; Pending means an approved application is in progress. Adopted and Transferred are terminal and always have an OutcomeDate.
    */
    get Status(): 'Adopted' | 'Available' | 'Fostered' | 'Intake' | 'Medical Hold' | 'Pending' | 'Transferred' {
        return this.Get('Status');
    }
    set Status(value: 'Adopted' | 'Available' | 'Fostered' | 'Intake' | 'Medical Hold' | 'Pending' | 'Transferred') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: OutcomeDate
    * * Display Name: Outcome Date
    * * SQL Data Type: date
    * * Description: Date the dog left the care of the shelter through adoption or transfer. NULL while the dog is still in care. Never earlier than IntakeDate.
    */
    get OutcomeDate(): Date | null {
        return this.Get('OutcomeDate');
    }
    set OutcomeDate(value: Date | null) {
        this.Set('OutcomeDate', value);
    }

    /**
    * * Field Name: DaysInCare
    * * Display Name: Days In Care
    * * SQL Data Type: int
    * * Description: COMPUTED, NOT PERSISTED: days between IntakeDate and OutcomeDate, or between IntakeDate and today for a dog still in care. This is the length-of-stay metric the shelter manages against.
    */
    get DaysInCare(): number | null {
        return this.Get('DaysInCare');
    }

    /**
    * * Field Name: IsSpayedNeutered
    * * Display Name: Spayed/Neutered
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Whether the dog has been spayed or neutered. Must be 1 before an adoption can be finalized.
    */
    get IsSpayedNeutered(): boolean {
        return this.Get('IsSpayedNeutered');
    }
    set IsSpayedNeutered(value: boolean) {
        this.Set('IsSpayedNeutered', value);
    }

    /**
    * * Field Name: IsHouseTrained
    * * Display Name: House Trained
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Whether the dog is reliably house trained.
    */
    get IsHouseTrained(): boolean {
        return this.Get('IsHouseTrained');
    }
    set IsHouseTrained(value: boolean) {
        this.Set('IsHouseTrained', value);
    }

    /**
    * * Field Name: GoodWithDogs
    * * Display Name: Good With Dogs
    * * SQL Data Type: bit
    * * Description: TRI-STATE: 1 = tested and does well with other dogs, 0 = tested and does not, NULL = not yet assessed. NULL is meaningfully different from 0 and must not be treated as a no.
    */
    get GoodWithDogs(): boolean | null {
        return this.Get('GoodWithDogs');
    }
    set GoodWithDogs(value: boolean | null) {
        this.Set('GoodWithDogs', value);
    }

    /**
    * * Field Name: GoodWithCats
    * * Display Name: Good With Cats
    * * SQL Data Type: bit
    * * Description: TRI-STATE: 1 = tested and does well with cats, 0 = tested and does not, NULL = not yet assessed.
    */
    get GoodWithCats(): boolean | null {
        return this.Get('GoodWithCats');
    }
    set GoodWithCats(value: boolean | null) {
        this.Set('GoodWithCats', value);
    }

    /**
    * * Field Name: GoodWithKids
    * * Display Name: Good With Kids
    * * SQL Data Type: bit
    * * Description: TRI-STATE: 1 = tested and does well with children, 0 = tested and does not, NULL = not yet assessed.
    */
    get GoodWithKids(): boolean | null {
        return this.Get('GoodWithKids');
    }
    set GoodWithKids(value: boolean | null) {
        this.Set('GoodWithKids', value);
    }

    /**
    * * Field Name: AdoptionFee
    * * Display Name: Adoption Fee
    * * SQL Data Type: decimal(10, 2)
    * * Default Value: 0
    * * Description: Adoption fee in dollars. Typically lower for large, senior, or long-stay dogs to encourage placement.
    */
    get AdoptionFee(): number {
        return this.Get('AdoptionFee');
    }
    set AdoptionFee(value: number) {
        this.Set('AdoptionFee', value);
    }

    /**
    * * Field Name: Bio
    * * Display Name: Bio
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Public-facing narrative used on the adoption listing.
    */
    get Bio(): string | null {
        return this.Get('Bio');
    }
    set Bio(value: string | null) {
        this.Set('Bio', value);
    }

    /**
    * * Field Name: PhotoURL
    * * Display Name: Photo URL
    * * SQL Data Type: nvarchar(1000)
    * * Description: URL of the primary adoption listing photo.
    */
    get PhotoURL(): string | null {
        return this.Get('PhotoURL');
    }
    set PhotoURL(value: string | null) {
        this.Set('PhotoURL', value);
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
    * * Field Name: Shelter
    * * Display Name: Shelter Name
    * * SQL Data Type: nvarchar(200)
    */
    get Shelter(): string {
        return this.Get('Shelter');
    }

    /**
    * * Field Name: PrimaryBreed
    * * Display Name: Primary Breed Name
    * * SQL Data Type: nvarchar(150)
    */
    get PrimaryBreed(): string {
        return this.Get('PrimaryBreed');
    }

    /**
    * * Field Name: SecondaryBreed
    * * Display Name: Secondary Breed Name
    * * SQL Data Type: nvarchar(150)
    */
    get SecondaryBreed(): string | null {
        return this.Get('SecondaryBreed');
    }

    /**
    * * Field Name: Mother
    * * Display Name: Mother Name
    * * SQL Data Type: nvarchar(100)
    */
    get Mother(): string | null {
        return this.Get('Mother');
    }

    /**
    * * Field Name: RootMotherID
    * * Display Name: Root Mother ID
    * * SQL Data Type: uniqueidentifier
    */
    get RootMotherID(): string | null {
        return this.Get('RootMotherID');
    }
}


/**
 * Foster Placements - strongly typed entity sub-class
 * * Schema: DogShelter
 * * Base Table: FosterPlacement
 * * Base View: vwFosterPlacements
 * * @description A temporary placement of a dog in a foster home. This is the SECOND many-to-many relationship between Dog and Adopter, which is why each of those entities ends up with two related-record tabs pointing at the other.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Foster Placements')
export class DogShelterFosterPlacementEntity extends BaseEntity<DogShelterFosterPlacementEntityType> {
    /**
    * Loads the Foster Placements record from the database
    * @param ID: string - primary key value to load the Foster Placements record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof DogShelterFosterPlacementEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for Foster Placements entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * Table-Level: The end date must be on or after the start date.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateEndDateAfterOrEqualStartDate(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * The end date must be on or after the start date.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateEndDateAfterOrEqualStartDate(result: ValidationResult) {
    	if (this.EndDate != null && this.StartDate != null) {
    		const startDate = new Date(this.StartDate);
    		const endDate = new Date(this.EndDate);
    		if (endDate < startDate) {
    			result.Errors.push(new ValidationErrorInfo(
    				"EndDate",
    				"The end date must be on or after the start date.",
    				this.EndDate,
    				ValidationErrorType.Failure
    			));
    		}
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    * * Description: Unique identifier for the foster placement.
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: DogID
    * * Display Name: Dog
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Dogs (vwDogs.ID)
    * * Description: The dog placed in foster care.
    */
    get DogID(): string {
        return this.Get('DogID');
    }
    set DogID(value: string) {
        this.Set('DogID', value);
    }

    /**
    * * Field Name: FosterAdopterID
    * * Display Name: Foster Caregiver
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Adopters (vwAdopters.ID)
    * * Description: The foster caregiver. Points at Adopter, and that person normally has IsFosterApproved = 1.
    */
    get FosterAdopterID(): string {
        return this.Get('FosterAdopterID');
    }
    set FosterAdopterID(value: string) {
        this.Set('FosterAdopterID', value);
    }

    /**
    * * Field Name: StartDate
    * * Display Name: Start Date
    * * SQL Data Type: date
    * * Description: Date the dog went into the foster home.
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
    * * SQL Data Type: date
    * * Description: Date the placement ended. NULL while the placement is still Active. Never earlier than StartDate.
    */
    get EndDate(): Date | null {
        return this.Get('EndDate');
    }
    set EndDate(value: Date | null) {
        this.Set('EndDate', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Placement Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Completed
    *   * Ended Early
    * * Description: State of the placement. One of: Active, Completed, Ended Early. Ended Early means the placement was cut short, usually for a behavioral or medical reason.
    */
    get Status(): 'Active' | 'Completed' | 'Ended Early' {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Completed' | 'Ended Early') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: Reason
    * * Display Name: Placement Reason
    * * SQL Data Type: nvarchar(200)
    * * Description: Why the dog was placed in foster care, for example post-surgery recovery or kennel stress.
    */
    get Reason(): string | null {
        return this.Get('Reason');
    }
    set Reason(value: string | null) {
        this.Set('Reason', value);
    }

    /**
    * * Field Name: Notes
    * * Display Name: Foster Notes
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Notes from the foster caregiver about how the dog behaves in a home.
    */
    get Notes(): string | null {
        return this.Get('Notes');
    }
    set Notes(value: string | null) {
        this.Set('Notes', value);
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
    * * Field Name: Dog
    * * Display Name: Dog Name
    * * SQL Data Type: nvarchar(100)
    */
    get Dog(): string {
        return this.Get('Dog');
    }

    /**
    * * Field Name: FosterAdopter
    * * Display Name: Foster Caregiver Name
    * * SQL Data Type: nvarchar(100)
    */
    get FosterAdopter(): string {
        return this.Get('FosterAdopter');
    }
}


/**
 * Game Designers - strongly typed entity sub-class
 * * Schema: BoardGameNight
 * * Base Table: GameDesigner
 * * Base View: vwGameDesigners
 * * @description Pure junction table linking Games to Designers in a many-to-many relationship. Carries no data of its own -- contrast with PlaySessionPlayer, which does.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Game Designers')
export class BoardGameNightGameDesignerEntity extends BaseEntity<BoardGameNightGameDesignerEntityType> {
    /**
    * Loads the Game Designers record from the database
    * @param ID: string - primary key value to load the Game Designers record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof BoardGameNightGameDesignerEntity
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
    * * Description: Unique identifier for this game-designer link.
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: GameID
    * * Display Name: Game
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Games (vwGames.ID)
    * * Description: Foreign key to the Game.
    */
    get GameID(): string {
        return this.Get('GameID');
    }
    set GameID(value: string) {
        this.Set('GameID', value);
    }

    /**
    * * Field Name: DesignerID
    * * Display Name: Designer
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Designers (vwDesigners.ID)
    * * Description: Foreign key to the Designer.
    */
    get DesignerID(): string {
        return this.Get('DesignerID');
    }
    set DesignerID(value: string) {
        this.Set('DesignerID', value);
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
    * * Field Name: Game
    * * Display Name: Game Name
    * * SQL Data Type: nvarchar(255)
    */
    get Game(): string {
        return this.Get('Game');
    }

    /**
    * * Field Name: Designer
    * * Display Name: Designer Name
    * * SQL Data Type: nvarchar(100)
    */
    get Designer(): string {
        return this.Get('Designer');
    }
}


/**
 * Games - strongly typed entity sub-class
 * * Schema: BoardGameNight
 * * Base Table: Game
 * * Base View: vwGames
 * * @description A board game in the collection, on the wishlist, or previously owned. Belongs to one Publisher, has many Designers through GameDesigner, and is played across many PlaySessions.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Games')
export class BoardGameNightGameEntity extends BaseEntity<BoardGameNightGameEntityType> {
    /**
    * Loads the Games record from the database
    * @param ID: string - primary key value to load the Games record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof BoardGameNightGameEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for Games entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * Weight: The weight of a board game must be between 1.00 and 5.00, or left blank if unknown.
    * * Table-Level: The maximum play time must be greater than or equal to the minimum play time when both values are specified.
    * * Table-Level: The minimum number of players must be at least 1, and the maximum number of players must be greater than or equal to the minimum number of players.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateWeightRange(result);
        this.ValidateMaxPlayTimeMinutesGreaterThanOrEqualToMinPlayTimeMinutes(result);
        this.ValidatePlayerCountRange(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * The weight of a board game must be between 1.00 and 5.00, or left blank if unknown.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateWeightRange(result: ValidationResult) {
    	// Check if Weight is specified and falls outside the allowed range of 1.00 to 5.00
    	if (this.Weight != null && (this.Weight < 1.00 || this.Weight > 5.00)) {
    		result.Errors.push(new ValidationErrorInfo(
    			"Weight",
    			"Weight must be between 1.00 and 5.00.",
    			this.Weight,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * The maximum play time must be greater than or equal to the minimum play time when both values are specified.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateMaxPlayTimeMinutesGreaterThanOrEqualToMinPlayTimeMinutes(result: ValidationResult) {
    	if (this.MinPlayTimeMinutes != null && this.MaxPlayTimeMinutes != null && this.MaxPlayTimeMinutes < this.MinPlayTimeMinutes) {
    		result.Errors.push(new ValidationErrorInfo(
    			"MaxPlayTimeMinutes",
    			"Maximum play time minutes must be greater than or equal to minimum play time minutes.",
    			this.MaxPlayTimeMinutes,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * The minimum number of players must be at least 1, and the maximum number of players must be greater than or equal to the minimum number of players.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidatePlayerCountRange(result: ValidationResult) {
    	if (this.MinPlayers != null && this.MinPlayers < 1) {
    		result.Errors.push(new ValidationErrorInfo(
    			"MinPlayers",
    			"Minimum players must be at least 1.",
    			this.MinPlayers,
    			ValidationErrorType.Failure
    		));
    	}
    	if (this.MinPlayers != null && this.MaxPlayers != null && this.MaxPlayers < this.MinPlayers) {
    		result.Errors.push(new ValidationErrorInfo(
    			"MaxPlayers",
    			"Maximum players must be greater than or equal to the minimum players (" + this.MinPlayers + ").",
    			this.MaxPlayers,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    * * Description: Unique identifier for this game.
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(255)
    * * Description: Game title as printed on the box.
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: PublisherID
    * * Display Name: Publisher ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Publishers (vwPublishers.ID)
    * * Description: Foreign key to the Publisher that released this edition.
    */
    get PublisherID(): string {
        return this.Get('PublisherID');
    }
    set PublisherID(value: string) {
        this.Set('PublisherID', value);
    }

    /**
    * * Field Name: YearPublished
    * * Display Name: Year Published
    * * SQL Data Type: int
    * * Description: Year of first publication.
    */
    get YearPublished(): number | null {
        return this.Get('YearPublished');
    }
    set YearPublished(value: number | null) {
        this.Set('YearPublished', value);
    }

    /**
    * * Field Name: MinPlayers
    * * Display Name: Min Players
    * * SQL Data Type: int
    * * Description: Minimum number of players supported by the rules.
    */
    get MinPlayers(): number {
        return this.Get('MinPlayers');
    }
    set MinPlayers(value: number) {
        this.Set('MinPlayers', value);
    }

    /**
    * * Field Name: MaxPlayers
    * * Display Name: Max Players
    * * SQL Data Type: int
    * * Description: Maximum number of players supported by the rules.
    */
    get MaxPlayers(): number {
        return this.Get('MaxPlayers');
    }
    set MaxPlayers(value: number) {
        this.Set('MaxPlayers', value);
    }

    /**
    * * Field Name: MinPlayTimeMinutes
    * * Display Name: Min Play Time (Minutes)
    * * SQL Data Type: int
    * * Description: Publisher-stated minimum play time in minutes.
    */
    get MinPlayTimeMinutes(): number | null {
        return this.Get('MinPlayTimeMinutes');
    }
    set MinPlayTimeMinutes(value: number | null) {
        this.Set('MinPlayTimeMinutes', value);
    }

    /**
    * * Field Name: MaxPlayTimeMinutes
    * * Display Name: Max Play Time (Minutes)
    * * SQL Data Type: int
    * * Description: Publisher-stated maximum play time in minutes. Compare against PlaySession.DurationMinutes to see how badly the box lies.
    */
    get MaxPlayTimeMinutes(): number | null {
        return this.Get('MaxPlayTimeMinutes');
    }
    set MaxPlayTimeMinutes(value: number | null) {
        this.Set('MaxPlayTimeMinutes', value);
    }

    /**
    * * Field Name: Weight
    * * Display Name: Weight
    * * SQL Data Type: decimal(3, 2)
    * * Description: Complexity rating from 1.00 (lightest) to 5.00 (heaviest), BoardGameGeek style. Enforced by a range CHECK, not a value list.
    */
    get Weight(): number | null {
        return this.Get('Weight');
    }
    set Weight(value: number | null) {
        this.Set('Weight', value);
    }

    /**
    * * Field Name: Category
    * * Display Name: Category
    * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Abstract
    *   * Co-op
    *   * Deck Builder
    *   * Dexterity
    *   * Family
    *   * Legacy
    *   * Party
    *   * Strategy
    *   * Trivia
    * * Description: Primary game category. Constrained to a fixed list, which CodeGen turns into a dropdown.
    */
    get Category(): 'Abstract' | 'Co-op' | 'Deck Builder' | 'Dexterity' | 'Family' | 'Legacy' | 'Party' | 'Strategy' | 'Trivia' {
        return this.Get('Category');
    }
    set Category(value: 'Abstract' | 'Co-op' | 'Deck Builder' | 'Dexterity' | 'Family' | 'Legacy' | 'Party' | 'Strategy' | 'Trivia') {
        this.Set('Category', value);
    }

    /**
    * * Field Name: OwnershipStatus
    * * Display Name: Ownership Status
    * * SQL Data Type: nvarchar(30)
    * * Default Value: Owned
    * * Value List Type: List
    * * Possible Values 
    *   * Loaned Out
    *   * Owned
    *   * Retired
    *   * Sold
    *   * Wishlist
    * * Description: Current ownership state of this title. Constrained to a fixed list, which CodeGen turns into a dropdown.
    */
    get OwnershipStatus(): 'Loaned Out' | 'Owned' | 'Retired' | 'Sold' | 'Wishlist' {
        return this.Get('OwnershipStatus');
    }
    set OwnershipStatus(value: 'Loaned Out' | 'Owned' | 'Retired' | 'Sold' | 'Wishlist') {
        this.Set('OwnershipStatus', value);
    }

    /**
    * * Field Name: AcquiredDate
    * * Display Name: Acquired Date
    * * SQL Data Type: date
    * * Description: Date the copy was acquired. Null for wishlist titles.
    */
    get AcquiredDate(): Date | null {
        return this.Get('AcquiredDate');
    }
    set AcquiredDate(value: Date | null) {
        this.Set('AcquiredDate', value);
    }

    /**
    * * Field Name: PurchasePrice
    * * Display Name: Purchase Price
    * * SQL Data Type: decimal(10, 2)
    * * Description: Purchase price paid, in USD. Null for wishlist titles or gifts.
    */
    get PurchasePrice(): number | null {
        return this.Get('PurchasePrice');
    }
    set PurchasePrice(value: number | null) {
        this.Set('PurchasePrice', value);
    }

    /**
    * * Field Name: Notes
    * * Display Name: Notes
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Free-form notes about this copy: expansions owned, house rules, condition.
    */
    get Notes(): string | null {
        return this.Get('Notes');
    }
    set Notes(value: string | null) {
        this.Set('Notes', value);
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
    * * Field Name: Publisher
    * * Display Name: Publisher
    * * SQL Data Type: nvarchar(200)
    */
    get Publisher(): string {
        return this.Get('Publisher');
    }
}


/**
 * Medical Records - strongly typed entity sub-class
 * * Schema: DogShelter
 * * Base Table: MedicalRecord
 * * Base View: vwMedicalRecords
 * * @description One entry in the medical history of a dog. Many rows per dog, forming a timeline from intake exam through vaccinations and any surgery.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Medical Records')
export class DogShelterMedicalRecordEntity extends BaseEntity<DogShelterMedicalRecordEntityType> {
    /**
    * Loads the Medical Records record from the database
    * @param ID: string - primary key value to load the Medical Records record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof DogShelterMedicalRecordEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for Medical Records entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * Cost: The cost of the record must be zero or a positive value. Negative costs are not permitted.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateCostIsNonNegative(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * The cost of the record must be zero or a positive value. Negative costs are not permitted.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateCostIsNonNegative(result: ValidationResult) {
    	if (this.Cost != null && this.Cost < 0) {
    		result.Errors.push(new ValidationErrorInfo(
    			"Cost",
    			"Cost must be greater than or equal to 0.",
    			this.Cost,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    * * Description: Unique identifier for the medical record entry.
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: DogID
    * * Display Name: Dog
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Dogs (vwDogs.ID)
    * * Description: The dog this record belongs to.
    */
    get DogID(): string {
        return this.Get('DogID');
    }
    set DogID(value: string) {
        this.Set('DogID', value);
    }

    /**
    * * Field Name: RecordDate
    * * Display Name: Record Date
    * * SQL Data Type: date
    * * Description: Date the procedure or observation took place.
    */
    get RecordDate(): Date {
        return this.Get('RecordDate');
    }
    set RecordDate(value: Date) {
        this.Set('RecordDate', value);
    }

    /**
    * * Field Name: RecordType
    * * Display Name: Record Type
    * * SQL Data Type: nvarchar(30)
    * * Value List Type: List
    * * Possible Values 
    *   * Dental
    *   * Exam
    *   * Surgery
    *   * Test
    *   * Treatment
    *   * Vaccination
    * * Description: Kind of medical event. One of: Vaccination, Exam, Surgery, Treatment, Test, Dental.
    */
    get RecordType(): 'Dental' | 'Exam' | 'Surgery' | 'Test' | 'Treatment' | 'Vaccination' {
        return this.Get('RecordType');
    }
    set RecordType(value: 'Dental' | 'Exam' | 'Surgery' | 'Test' | 'Treatment' | 'Vaccination') {
        this.Set('RecordType', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(500)
    * * Description: Short description of what was done, for example DHPP booster or dental cleaning with two extractions.
    */
    get Description(): string {
        return this.Get('Description');
    }
    set Description(value: string) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: VeterinarianStaffID
    * * Display Name: Veterinarian Staff
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Staffs (vwStaffs.ID)
    * * Description: The Veterinarian or Vet Tech who performed the work. NULL for records entered from an outside clinic.
    */
    get VeterinarianStaffID(): string | null {
        return this.Get('VeterinarianStaffID');
    }
    set VeterinarianStaffID(value: string | null) {
        this.Set('VeterinarianStaffID', value);
    }

    /**
    * * Field Name: Cost
    * * Display Name: Cost
    * * SQL Data Type: decimal(10, 2)
    * * Default Value: 0
    * * Description: Cost of the procedure in dollars. Summed per dog to understand the true cost of care.
    */
    get Cost(): number {
        return this.Get('Cost');
    }
    set Cost(value: number) {
        this.Set('Cost', value);
    }

    /**
    * * Field Name: FollowUpDate
    * * Display Name: Follow-up Date
    * * SQL Data Type: date
    * * Description: Date a follow-up is due, for example the next booster. NULL when no follow-up is needed.
    */
    get FollowUpDate(): Date | null {
        return this.Get('FollowUpDate');
    }
    set FollowUpDate(value: Date | null) {
        this.Set('FollowUpDate', value);
    }

    /**
    * * Field Name: Notes
    * * Display Name: Notes
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Additional clinical notes.
    */
    get Notes(): string | null {
        return this.Get('Notes');
    }
    set Notes(value: string | null) {
        this.Set('Notes', value);
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
    * * Field Name: Dog
    * * Display Name: Dog Name
    * * SQL Data Type: nvarchar(100)
    */
    get Dog(): string {
        return this.Get('Dog');
    }

    /**
    * * Field Name: VeterinarianStaff
    * * Display Name: Staff Name
    * * SQL Data Type: nvarchar(100)
    */
    get VeterinarianStaff(): string | null {
        return this.Get('VeterinarianStaff');
    }
}


/**
 * Play Session Players - strongly typed entity sub-class
 * * Schema: BoardGameNight
 * * Base Table: PlaySessionPlayer
 * * Base View: vwPlaySessionPlayers
 * * @description Junction table linking a Player to a PlaySession, carrying that player's result for that session. Unlike GameDesigner, this junction has a payload -- score, placement, and win flag -- which is why CodeGen generates a data-bearing grid on both parent forms.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Play Session Players')
export class BoardGameNightPlaySessionPlayerEntity extends BaseEntity<BoardGameNightPlaySessionPlayerEntityType> {
    /**
    * Loads the Play Session Players record from the database
    * @param ID: string - primary key value to load the Play Session Players record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof BoardGameNightPlaySessionPlayerEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for Play Session Players entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * Placement: If a placement is specified, it must be 1 or greater. This ensures that player rankings are valid positive integers.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidatePlacementGreaterThanOrEqualToOne(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * If a placement is specified, it must be 1 or greater. This ensures that player rankings are valid positive integers.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidatePlacementGreaterThanOrEqualToOne(result: ValidationResult) {
    	if (this.Placement != null && this.Placement < 1) {
    		result.Errors.push(new ValidationErrorInfo(
    			"Placement",
    			"Placement must be 1 or greater.",
    			this.Placement,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    * * Description: Unique identifier for this participation record.
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: PlaySessionID
    * * Display Name: Play Session
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Play Sessions (vwPlaySessions.ID)
    * * Description: Foreign key to the PlaySession.
    */
    get PlaySessionID(): string {
        return this.Get('PlaySessionID');
    }
    set PlaySessionID(value: string) {
        this.Set('PlaySessionID', value);
    }

    /**
    * * Field Name: PlayerID
    * * Display Name: Player
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Players (vwPlayers.ID)
    * * Description: Foreign key to the Player.
    */
    get PlayerID(): string {
        return this.Get('PlayerID');
    }
    set PlayerID(value: string) {
        this.Set('PlayerID', value);
    }

    /**
    * * Field Name: Score
    * * Display Name: Score
    * * SQL Data Type: int
    * * Description: Final score for this player. Null for cooperative and abandoned sessions, where individual scores do not exist.
    */
    get Score(): number | null {
        return this.Get('Score');
    }
    set Score(value: number | null) {
        this.Set('Score', value);
    }

    /**
    * * Field Name: Placement
    * * Display Name: Placement
    * * SQL Data Type: int
    * * Description: Finishing position, 1 being first. Null for cooperative and abandoned sessions.
    */
    get Placement(): number | null {
        return this.Get('Placement');
    }
    set Placement(value: number | null) {
        this.Set('Placement', value);
    }

    /**
    * * Field Name: IsWinner
    * * Display Name: Is Winner
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Whether this player won. In a cooperative session every participant shares the same value.
    */
    get IsWinner(): boolean {
        return this.Get('IsWinner');
    }
    set IsWinner(value: boolean) {
        this.Set('IsWinner', value);
    }

    /**
    * * Field Name: FactionOrColor
    * * Display Name: Faction or Color
    * * SQL Data Type: nvarchar(100)
    * * Description: Which faction, character, spirit, or player color this player used.
    */
    get FactionOrColor(): string | null {
        return this.Get('FactionOrColor');
    }
    set FactionOrColor(value: string | null) {
        this.Set('FactionOrColor', value);
    }

    /**
    * * Field Name: Notes
    * * Display Name: Notes
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Free-form notes about this player's game.
    */
    get Notes(): string | null {
        return this.Get('Notes');
    }
    set Notes(value: string | null) {
        this.Set('Notes', value);
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
    * * Field Name: Player
    * * Display Name: Player Name
    * * SQL Data Type: nvarchar(100)
    */
    get Player(): string {
        return this.Get('Player');
    }
}


/**
 * Play Sessions - strongly typed entity sub-class
 * * Schema: BoardGameNight
 * * Base Table: PlaySession
 * * Base View: vwPlaySessions
 * * @description One playthrough of one Game on one night. Has many participants through PlaySessionPlayer.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Play Sessions')
export class BoardGameNightPlaySessionEntity extends BaseEntity<BoardGameNightPlaySessionEntityType> {
    /**
    * Loads the Play Sessions record from the database
    * @param ID: string - primary key value to load the Play Sessions record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof BoardGameNightPlaySessionEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for Play Sessions entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * DurationMinutes: The duration of the game in minutes must be greater than zero if it is specified.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateDurationMinutesGreaterThanZero(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * The duration of the game in minutes must be greater than zero if it is specified.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateDurationMinutesGreaterThanZero(result: ValidationResult) {
    	if (this.DurationMinutes != null && this.DurationMinutes <= 0) {
    		result.Errors.push(new ValidationErrorInfo(
    			"DurationMinutes",
    			"Duration in minutes must be greater than zero.",
    			this.DurationMinutes,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    * * Description: Unique identifier for this play session.
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: GameID
    * * Display Name: Game
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Games (vwGames.ID)
    * * Description: Foreign key to the Game that was played.
    */
    get GameID(): string {
        return this.Get('GameID');
    }
    set GameID(value: string) {
        this.Set('GameID', value);
    }

    /**
    * * Field Name: PlayedAt
    * * Display Name: Date Played
    * * SQL Data Type: datetime2
    * * Description: Date and time the session started.
    */
    get PlayedAt(): Date {
        return this.Get('PlayedAt');
    }
    set PlayedAt(value: Date) {
        this.Set('PlayedAt', value);
    }

    /**
    * * Field Name: LocationName
    * * Display Name: Location
    * * SQL Data Type: nvarchar(200)
    * * Description: Where the session took place.
    */
    get LocationName(): string | null {
        return this.Get('LocationName');
    }
    set LocationName(value: string | null) {
        this.Set('LocationName', value);
    }

    /**
    * * Field Name: DurationMinutes
    * * Display Name: Duration (Minutes)
    * * SQL Data Type: int
    * * Description: Actual elapsed play time in minutes, including setup and teardown.
    */
    get DurationMinutes(): number | null {
        return this.Get('DurationMinutes');
    }
    set DurationMinutes(value: number | null) {
        this.Set('DurationMinutes', value);
    }

    /**
    * * Field Name: Outcome
    * * Display Name: Outcome
    * * SQL Data Type: nvarchar(30)
    * * Default Value: Completed
    * * Value List Type: List
    * * Possible Values 
    *   * Abandoned
    *   * Co-op Loss
    *   * Co-op Win
    *   * Completed
    * * Description: How the session ended. Competitive games use Completed; cooperative games use Co-op Win or Co-op Loss; Abandoned means nobody finished. Constrained to a fixed list, which CodeGen turns into a dropdown.
    */
    get Outcome(): 'Abandoned' | 'Co-op Loss' | 'Co-op Win' | 'Completed' {
        return this.Get('Outcome');
    }
    set Outcome(value: 'Abandoned' | 'Co-op Loss' | 'Co-op Win' | 'Completed') {
        this.Set('Outcome', value);
    }

    /**
    * * Field Name: Notes
    * * Display Name: Notes
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Free-form notes about the session: memorable plays, rules arguments, what went wrong.
    */
    get Notes(): string | null {
        return this.Get('Notes');
    }
    set Notes(value: string | null) {
        this.Set('Notes', value);
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
    * * Field Name: Game
    * * Display Name: Game Name
    * * SQL Data Type: nvarchar(255)
    */
    get Game(): string {
        return this.Get('Game');
    }
}


/**
 * Players - strongly typed entity sub-class
 * * Schema: BoardGameNight
 * * Base Table: Player
 * * Base View: vwPlayers
 * * @description A person who attends game night. Linked to PlaySession through PlaySessionPlayer, which also records how they did.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Players')
export class BoardGameNightPlayerEntity extends BaseEntity<BoardGameNightPlayerEntityType> {
    /**
    * Loads the Players record from the database
    * @param ID: string - primary key value to load the Players record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof BoardGameNightPlayerEntity
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
    * * Description: Unique identifier for this player.
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: FirstName
    * * Display Name: First Name
    * * SQL Data Type: nvarchar(100)
    * * Description: Player given name.
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
    * * SQL Data Type: nvarchar(100)
    * * Description: Player family name.
    */
    get LastName(): string {
        return this.Get('LastName');
    }
    set LastName(value: string) {
        this.Set('LastName', value);
    }

    /**
    * * Field Name: Nickname
    * * Display Name: Nickname
    * * SQL Data Type: nvarchar(50)
    * * Description: What everyone actually calls them at the table.
    */
    get Nickname(): string | null {
        return this.Get('Nickname');
    }
    set Nickname(value: string | null) {
        this.Set('Nickname', value);
    }

    /**
    * * Field Name: Email
    * * Display Name: Email
    * * SQL Data Type: nvarchar(255)
    * * Description: Contact email address. Unique across all players.
    */
    get Email(): string | null {
        return this.Get('Email');
    }
    set Email(value: string | null) {
        this.Set('Email', value);
    }

    /**
    * * Field Name: JoinedDate
    * * Display Name: Joined Date
    * * SQL Data Type: date
    * * Description: Date this player first joined the group.
    */
    get JoinedDate(): Date | null {
        return this.Get('JoinedDate');
    }
    set JoinedDate(value: Date | null) {
        this.Set('JoinedDate', value);
    }

    /**
    * * Field Name: SkillLevel
    * * Display Name: Skill Level
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Casual
    * * Value List Type: List
    * * Possible Values 
    *   * Casual
    *   * Novice
    *   * Regular
    *   * Shark
    * * Description: Self-reported experience level. Constrained to a fixed list, which CodeGen turns into a dropdown.
    */
    get SkillLevel(): 'Casual' | 'Novice' | 'Regular' | 'Shark' {
        return this.Get('SkillLevel');
    }
    set SkillLevel(value: 'Casual' | 'Novice' | 'Regular' | 'Shark') {
        this.Set('SkillLevel', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: Whether this player still attends. Inactive players are retained so historical sessions stay intact.
    */
    get IsActive(): boolean {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
        this.Set('IsActive', value);
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


/**
 * Publishers - strongly typed entity sub-class
 * * Schema: BoardGameNight
 * * Base Table: Publisher
 * * Base View: vwPublishers
 * * @description A company that publishes board games. Parent of Game in a one-to-many relationship.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Publishers')
export class BoardGameNightPublisherEntity extends BaseEntity<BoardGameNightPublisherEntityType> {
    /**
    * Loads the Publishers record from the database
    * @param ID: string - primary key value to load the Publishers record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof BoardGameNightPublisherEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for Publishers entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * FoundedYear: The year the organization was founded must be between 1800 and 2100, or left blank if unknown.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateFoundedYearRange(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * The year the organization was founded must be between 1800 and 2100, or left blank if unknown.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateFoundedYearRange(result: ValidationResult) {
    	if (this.FoundedYear != null && (this.FoundedYear < 1800 || this.FoundedYear > 2100)) {
    		result.Errors.push(new ValidationErrorInfo(
    			"FoundedYear",
    			"Founded year must be between 1800 and 2100.",
    			this.FoundedYear,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    * * Description: Unique identifier for this publisher.
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(200)
    * * Description: Company name as it appears on the box. Unique across all publishers.
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: FoundedYear
    * * Display Name: Founded Year
    * * SQL Data Type: int
    * * Description: Year the company was founded.
    */
    get FoundedYear(): number | null {
        return this.Get('FoundedYear');
    }
    set FoundedYear(value: number | null) {
        this.Set('FoundedYear', value);
    }

    /**
    * * Field Name: Country
    * * Display Name: Country
    * * SQL Data Type: nvarchar(100)
    * * Description: Country where the publisher is headquartered.
    */
    get Country(): string | null {
        return this.Get('Country');
    }
    set Country(value: string | null) {
        this.Set('Country', value);
    }

    /**
    * * Field Name: Website
    * * Display Name: Website
    * * SQL Data Type: nvarchar(500)
    * * Description: Publisher website URL.
    */
    get Website(): string | null {
        return this.Get('Website');
    }
    set Website(value: string | null) {
        this.Set('Website', value);
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


/**
 * Shelters - strongly typed entity sub-class
 * * Schema: DogShelter
 * * Base Table: Shelter
 * * Base View: vwShelters
 * * @description A physical shelter location that houses dogs. Root entity of the DogShelter demo schema - staff and dogs both belong to exactly one shelter.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Shelters')
export class DogShelterShelterEntity extends BaseEntity<DogShelterShelterEntityType> {
    /**
    * Loads the Shelters record from the database
    * @param ID: string - primary key value to load the Shelters record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof DogShelterShelterEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for Shelters entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * KennelCapacity: Kennel capacity must be greater than zero to ensure the facility has space to accommodate animals.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateKennelCapacityGreaterThanZero(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * Kennel capacity must be greater than zero to ensure the facility has space to accommodate animals.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateKennelCapacityGreaterThanZero(result: ValidationResult) {
    	if (this.KennelCapacity <= 0) {
    		result.Errors.push(new ValidationErrorInfo(
    			"KennelCapacity",
    			"Kennel capacity must be greater than zero.",
    			this.KennelCapacity,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    * * Description: Unique identifier for the shelter location.
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(200)
    * * Description: Public-facing name of the shelter. Unique across all locations.
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: AddressLine1
    * * Display Name: Address Line 1
    * * SQL Data Type: nvarchar(200)
    * * Description: Street address of the shelter.
    */
    get AddressLine1(): string | null {
        return this.Get('AddressLine1');
    }
    set AddressLine1(value: string | null) {
        this.Set('AddressLine1', value);
    }

    /**
    * * Field Name: City
    * * Display Name: City
    * * SQL Data Type: nvarchar(100)
    * * Description: City where the shelter is located.
    */
    get City(): string {
        return this.Get('City');
    }
    set City(value: string) {
        this.Set('City', value);
    }

    /**
    * * Field Name: State
    * * Display Name: State
    * * SQL Data Type: nvarchar(50)
    * * Description: State or province where the shelter is located.
    */
    get State(): string {
        return this.Get('State');
    }
    set State(value: string) {
        this.Set('State', value);
    }

    /**
    * * Field Name: PostalCode
    * * Display Name: Postal Code
    * * SQL Data Type: nvarchar(20)
    * * Description: Postal or ZIP code of the shelter address.
    */
    get PostalCode(): string | null {
        return this.Get('PostalCode');
    }
    set PostalCode(value: string | null) {
        this.Set('PostalCode', value);
    }

    /**
    * * Field Name: Phone
    * * Display Name: Phone
    * * SQL Data Type: nvarchar(50)
    * * Description: Main public phone number for adoption inquiries.
    */
    get Phone(): string | null {
        return this.Get('Phone');
    }
    set Phone(value: string | null) {
        this.Set('Phone', value);
    }

    /**
    * * Field Name: Email
    * * Display Name: Email
    * * SQL Data Type: nvarchar(255)
    * * Description: General contact email address for the shelter.
    */
    get Email(): string | null {
        return this.Get('Email');
    }
    set Email(value: string | null) {
        this.Set('Email', value);
    }

    /**
    * * Field Name: KennelCapacity
    * * Display Name: Kennel Capacity
    * * SQL Data Type: int
    * * Default Value: 40
    * * Description: Maximum number of dogs the shelter can physically house at one time. Used as the denominator when calculating occupancy.
    */
    get KennelCapacity(): number {
        return this.Get('KennelCapacity');
    }
    set KennelCapacity(value: number) {
        this.Set('KennelCapacity', value);
    }

    /**
    * * Field Name: OpenedDate
    * * Display Name: Opened Date
    * * SQL Data Type: date
    * * Description: Date this shelter location opened.
    */
    get OpenedDate(): Date | null {
        return this.Get('OpenedDate');
    }
    set OpenedDate(value: Date | null) {
        this.Set('OpenedDate', value);
    }

    /**
    * * Field Name: IsAcceptingIntakes
    * * Display Name: Accepting Intakes
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: When 0, the shelter is at or over capacity and is temporarily refusing new intakes.
    */
    get IsAcceptingIntakes(): boolean {
        return this.Get('IsAcceptingIntakes');
    }
    set IsAcceptingIntakes(value: boolean) {
        this.Set('IsAcceptingIntakes', value);
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


/**
 * Staffs - strongly typed entity sub-class
 * * Schema: DogShelter
 * * Base Table: Staff
 * * Base View: vwStaffs
 * * @description Shelter employees and volunteers. Self-referencing through SupervisorID to form a reporting hierarchy.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Staffs')
export class DogShelterStaffEntity extends BaseEntity<DogShelterStaffEntityType> {
    /**
    * Loads the Staffs record from the database
    * @param ID: string - primary key value to load the Staffs record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof DogShelterStaffEntity
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
    * * Description: Unique identifier for the staff member.
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ShelterID
    * * Display Name: Shelter ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Shelters (vwShelters.ID)
    * * Description: The shelter location this person works at.
    */
    get ShelterID(): string {
        return this.Get('ShelterID');
    }
    set ShelterID(value: string) {
        this.Set('ShelterID', value);
    }

    /**
    * * Field Name: FirstName
    * * Display Name: First Name
    * * SQL Data Type: nvarchar(100)
    * * Description: Given name of the staff member.
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
    * * SQL Data Type: nvarchar(100)
    * * Description: Family name of the staff member.
    */
    get LastName(): string {
        return this.Get('LastName');
    }
    set LastName(value: string) {
        this.Set('LastName', value);
    }

    /**
    * * Field Name: FullName
    * * Display Name: Full Name
    * * SQL Data Type: nvarchar(201)
    * * Description: PERSISTED computed column: FirstName plus a space plus LastName. Read-only. Serves as the human-readable display value wherever a staff member is referenced.
    */
    get FullName(): string {
        return this.Get('FullName');
    }

    /**
    * * Field Name: Email
    * * Display Name: Email
    * * SQL Data Type: nvarchar(255)
    * * Description: Work email address. Unique across all staff.
    */
    get Email(): string {
        return this.Get('Email');
    }
    set Email(value: string) {
        this.Set('Email', value);
    }

    /**
    * * Field Name: Phone
    * * Display Name: Phone
    * * SQL Data Type: nvarchar(50)
    * * Description: Contact phone number for the staff member.
    */
    get Phone(): string | null {
        return this.Get('Phone');
    }
    set Phone(value: string | null) {
        this.Set('Phone', value);
    }

    /**
    * * Field Name: Role
    * * Display Name: Role
    * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Adoption Counselor
    *   * Kennel Attendant
    *   * Shelter Manager
    *   * Vet Tech
    *   * Veterinarian
    *   * Volunteer
    *   * Volunteer Coordinator
    * * Description: Job function. One of: Shelter Manager, Adoption Counselor, Veterinarian, Vet Tech, Kennel Attendant, Volunteer Coordinator, Volunteer. Only Veterinarian and Vet Tech records appear as the vet on a medical record.
    */
    get Role(): 'Adoption Counselor' | 'Kennel Attendant' | 'Shelter Manager' | 'Vet Tech' | 'Veterinarian' | 'Volunteer' | 'Volunteer Coordinator' {
        return this.Get('Role');
    }
    set Role(value: 'Adoption Counselor' | 'Kennel Attendant' | 'Shelter Manager' | 'Vet Tech' | 'Veterinarian' | 'Volunteer' | 'Volunteer Coordinator') {
        this.Set('Role', value);
    }

    /**
    * * Field Name: HireDate
    * * Display Name: Hire Date
    * * SQL Data Type: date
    * * Description: Date the person started working or volunteering at the shelter.
    */
    get HireDate(): Date {
        return this.Get('HireDate');
    }
    set HireDate(value: Date) {
        this.Set('HireDate', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: When 0, the person no longer works at the shelter. Historical records still reference them, so rows are deactivated rather than deleted.
    */
    get IsActive(): boolean {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
        this.Set('IsActive', value);
    }

    /**
    * * Field Name: SupervisorID
    * * Display Name: Supervisor ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Staffs (vwStaffs.ID)
    * * Description: SELF-REFERENCING foreign key to the staff member this person reports to. NULL for the shelter manager at the top of each location hierarchy.
    */
    get SupervisorID(): string | null {
        return this.Get('SupervisorID');
    }
    set SupervisorID(value: string | null) {
        this.Set('SupervisorID', value);
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
    * * Field Name: Shelter
    * * Display Name: Shelter
    * * SQL Data Type: nvarchar(200)
    */
    get Shelter(): string {
        return this.Get('Shelter');
    }

    /**
    * * Field Name: Supervisor
    * * Display Name: Supervisor
    * * SQL Data Type: nvarchar(100)
    */
    get Supervisor(): string | null {
        return this.Get('Supervisor');
    }

    /**
    * * Field Name: RootSupervisorID
    * * Display Name: Root Supervisor ID
    * * SQL Data Type: uniqueidentifier
    */
    get RootSupervisorID(): string | null {
        return this.Get('RootSupervisorID');
    }
}


/**
 * Traits - strongly typed entity sub-class
 * * Schema: DogShelter
 * * Base Table: Trait
 * * Base View: vwTraits
 * * @description Controlled vocabulary of behavioral and care tags that can be applied to dogs through the DogTrait junction table.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Traits')
export class DogShelterTraitEntity extends BaseEntity<DogShelterTraitEntityType> {
    /**
    * Loads the Traits record from the database
    * @param ID: string - primary key value to load the Traits record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof DogShelterTraitEntity
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
    * * Description: Unique identifier for the trait.
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(100)
    * * Description: Short label shown as a tag on the dog record, for example Loves Car Rides.
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Category
    * * Display Name: Category
    * * SQL Data Type: nvarchar(30)
    * * Value List Type: List
    * * Possible Values 
    *   * Activity
    *   * Special Needs
    *   * Temperament
    *   * Training
    * * Description: Grouping for the trait. One of: Temperament, Training, Special Needs, Activity.
    */
    get Category(): 'Activity' | 'Special Needs' | 'Temperament' | 'Training' {
        return this.Get('Category');
    }
    set Category(value: 'Activity' | 'Special Needs' | 'Temperament' | 'Training') {
        this.Set('Category', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(500)
    * * Description: Explanation of what the trait means and how staff should apply it.
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
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
