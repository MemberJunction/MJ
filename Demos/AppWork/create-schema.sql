-- =============================================================================================================
-- DogShelter Demo Schema
-- MemberJunction Teaching Demo: New Entities + CodeGen
--
-- A small, dog-focused animal shelter database designed to be built live in front of a class.
-- Every design choice here exists to make a specific MemberJunction / CodeGen behavior visible:
--
--   1. CHECK constraints  -> strongly-typed TypeScript union types + dropdowns in generated forms
--        Dog.Status, Dog.IntakeType, Dog.Sex, Breed.SizeCategory, Staff.Role, and more.
--
--   2. Two FKs to the SAME table -> two distinctly-named virtual fields and two related-record tabs
--        Dog.PrimaryBreedID and Dog.SecondaryBreedID both point at Breed.
--
--   3. Self-referencing FKs -> hierarchy / tree UI
--        Staff.SupervisorID -> Staff, and Dog.MotherID -> Dog (for litters born in care).
--
--   4. Computed columns -> read-only fields in the generated entity classes
--        Dog.EstimatedAgeMonths and Dog.DaysInCare (non-persisted, GETDATE()-based),
--        Staff.FullName and Adopter.FullName (PERSISTED, deterministic).
--
--   5. TWO different many-to-many relationships between the SAME pair of entities
--        Dog <-> Adopter via AdoptionApplication, and Dog <-> Adopter via FosterPlacement.
--        Each side gets two clearly-labeled related tabs.
--
--   6. A pure junction table -> tag-style UI
--        DogTrait joins Dog and Trait.
--
--   7. Extended properties on EVERY table and EVERY column
--        These flow into the Explorer UI as tooltips AND into the AI agent's schema context.
--        Great live A/B: strip one description, re-run CodeGen, watch the agent get vaguer.
--
-- USAGE:
--   Run this script against your SQL Server database. It creates the [DogShelter] schema and
--   everything inside it. It does NOT touch the MJ metadata schema (__mj).
--   After running, follow the README for the CodeGen integration steps.
--
-- IDEMPOTENT: This script drops and recreates everything. Safe to re-run.
--
-- SAMPLE DATA: Dates are generated relative to GETDATE(), so the data always looks "recent"
--   no matter when the class is held. Everything else is deterministic — every attendee's
--   database ends up with the same dogs, the same breeds, and the same counts.
-- =============================================================================================================

SET NOCOUNT ON;
GO

-- =============================================================================================================
-- PHASE 1: CREATE SCHEMA (and drop any prior objects)
-- =============================================================================================================
PRINT '=== Phase 1: Creating DogShelter schema ===';

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'DogShelter')
BEGIN
    EXEC('CREATE SCHEMA [DogShelter]');
    PRINT '  Created schema [DogShelter]';
END
ELSE
BEGIN
    PRINT '  Schema [DogShelter] already exists, dropping existing objects...';

    -- NOTE: this script creates NO views. CodeGen owns the [DogShelter].[vw*] namespace —
    -- it generates a base view per entity. Hand-authoring views in this schema would collide
    -- conceptually with what CodeGen produces and confuse the lesson.
    -- Tables in reverse dependency order
    IF OBJECT_ID('DogShelter.DogTrait',            'U') IS NOT NULL DROP TABLE [DogShelter].[DogTrait];
    IF OBJECT_ID('DogShelter.MedicalRecord',       'U') IS NOT NULL DROP TABLE [DogShelter].[MedicalRecord];
    IF OBJECT_ID('DogShelter.FosterPlacement',     'U') IS NOT NULL DROP TABLE [DogShelter].[FosterPlacement];
    IF OBJECT_ID('DogShelter.AdoptionApplication', 'U') IS NOT NULL DROP TABLE [DogShelter].[AdoptionApplication];
    IF OBJECT_ID('DogShelter.Dog',                 'U') IS NOT NULL DROP TABLE [DogShelter].[Dog];
    IF OBJECT_ID('DogShelter.Trait',               'U') IS NOT NULL DROP TABLE [DogShelter].[Trait];
    IF OBJECT_ID('DogShelter.Adopter',             'U') IS NOT NULL DROP TABLE [DogShelter].[Adopter];
    IF OBJECT_ID('DogShelter.Staff',               'U') IS NOT NULL DROP TABLE [DogShelter].[Staff];
    IF OBJECT_ID('DogShelter.Breed',               'U') IS NOT NULL DROP TABLE [DogShelter].[Breed];
    IF OBJECT_ID('DogShelter.Shelter',             'U') IS NOT NULL DROP TABLE [DogShelter].[Shelter];

    PRINT '  Existing objects dropped';
END
GO

-- =============================================================================================================
-- PHASE 2: TABLES
-- =============================================================================================================
PRINT '=== Phase 2: Creating tables ===';

-- ---------------------------------------------------------------------------
-- Shelter: physical shelter locations. Root entity, no dependencies.
-- This is the table to create first when demoing live — it becomes a fully
-- working CRUD screen with search, views, and audit history on its own.
-- ---------------------------------------------------------------------------
CREATE TABLE [DogShelter].[Shelter] (
    [ID]             UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [Name]           NVARCHAR(200)    NOT NULL,
    [AddressLine1]   NVARCHAR(200)    NULL,
    [City]           NVARCHAR(100)    NOT NULL,
    [State]          NVARCHAR(50)     NOT NULL,
    [PostalCode]     NVARCHAR(20)     NULL,
    [Phone]          NVARCHAR(50)     NULL,
    [Email]          NVARCHAR(255)    NULL,
    [KennelCapacity] INT              NOT NULL DEFAULT 40,
    [OpenedDate]     DATE             NULL,
    [IsAcceptingIntakes] BIT          NOT NULL DEFAULT 1,
    CONSTRAINT [PK_DS_Shelter] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [UQ_DS_Shelter_Name] UNIQUE ([Name]),
    CONSTRAINT [CK_DS_Shelter_KennelCapacity] CHECK ([KennelCapacity] > 0)
);
PRINT '  Created [DogShelter].[Shelter]';

-- ---------------------------------------------------------------------------
-- Breed: lookup table. Four CHECK constraints here become four TypeScript
-- union types and four dropdowns in the generated form — with zero UI code.
-- ---------------------------------------------------------------------------
CREATE TABLE [DogShelter].[Breed] (
    [ID]                   UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [Name]                 NVARCHAR(150)    NOT NULL,
    [SizeCategory]         NVARCHAR(20)     NOT NULL,
    [TypicalWeightLbsLow]  INT              NULL,
    [TypicalWeightLbsHigh] INT              NULL,
    [EnergyLevel]          NVARCHAR(20)     NOT NULL,
    [GroomingNeeds]        NVARCHAR(20)     NOT NULL,
    [TypicalLifespanYears] INT              NULL,
    [Description]          NVARCHAR(1000)   NULL,
    CONSTRAINT [PK_DS_Breed] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [UQ_DS_Breed_Name] UNIQUE ([Name]),
    CONSTRAINT [CK_DS_Breed_SizeCategory]  CHECK ([SizeCategory]  IN ('Toy', 'Small', 'Medium', 'Large', 'Giant')),
    CONSTRAINT [CK_DS_Breed_EnergyLevel]   CHECK ([EnergyLevel]   IN ('Low', 'Moderate', 'High', 'Very High')),
    CONSTRAINT [CK_DS_Breed_GroomingNeeds] CHECK ([GroomingNeeds] IN ('Minimal', 'Moderate', 'High')),
    CONSTRAINT [CK_DS_Breed_WeightRange]   CHECK ([TypicalWeightLbsHigh] IS NULL OR [TypicalWeightLbsLow] IS NULL
                                                  OR [TypicalWeightLbsHigh] >= [TypicalWeightLbsLow])
);
PRINT '  Created [DogShelter].[Breed]';

-- ---------------------------------------------------------------------------
-- Staff: shelter employees and volunteers.
--   * SupervisorID is a SELF-REFERENCING FK -> hierarchy / tree UI.
--   * FullName is a PERSISTED computed column (deterministic, so it can persist).
--     Contrast with Dog.EstimatedAgeMonths below, which cannot be persisted.
-- ---------------------------------------------------------------------------
CREATE TABLE [DogShelter].[Staff] (
    [ID]           UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [ShelterID]    UNIQUEIDENTIFIER NOT NULL,
    [FirstName]    NVARCHAR(100)    NOT NULL,
    [LastName]     NVARCHAR(100)    NOT NULL,
    [FullName]     AS ([FirstName] + ' ' + [LastName]) PERSISTED,
    [Email]        NVARCHAR(255)    NOT NULL,
    [Phone]        NVARCHAR(50)     NULL,
    [Role]         NVARCHAR(50)     NOT NULL,
    [HireDate]     DATE             NOT NULL,
    [IsActive]     BIT              NOT NULL DEFAULT 1,
    [SupervisorID] UNIQUEIDENTIFIER NULL,
    CONSTRAINT [PK_DS_Staff] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [UQ_DS_Staff_Email] UNIQUE ([Email]),
    CONSTRAINT [FK_DS_Staff_Shelter]    FOREIGN KEY ([ShelterID])    REFERENCES [DogShelter].[Shelter]([ID]),
    CONSTRAINT [FK_DS_Staff_Supervisor] FOREIGN KEY ([SupervisorID]) REFERENCES [DogShelter].[Staff]([ID]),
    CONSTRAINT [CK_DS_Staff_Role] CHECK ([Role] IN ('Shelter Manager', 'Adoption Counselor', 'Veterinarian',
                                                    'Vet Tech', 'Kennel Attendant', 'Volunteer Coordinator', 'Volunteer'))
);
PRINT '  Created [DogShelter].[Staff]';

-- ---------------------------------------------------------------------------
-- Adopter: people who adopt or foster dogs.
-- ---------------------------------------------------------------------------
CREATE TABLE [DogShelter].[Adopter] (
    [ID]                UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [FirstName]         NVARCHAR(100)    NOT NULL,
    [LastName]          NVARCHAR(100)    NOT NULL,
    [FullName]          AS ([FirstName] + ' ' + [LastName]) PERSISTED,
    [Email]             NVARCHAR(255)    NOT NULL,
    [Phone]             NVARCHAR(50)     NULL,
    [AddressLine1]      NVARCHAR(200)    NULL,
    [City]              NVARCHAR(100)    NULL,
    [State]             NVARCHAR(50)     NULL,
    [PostalCode]        NVARCHAR(20)     NULL,
    [HousingType]       NVARCHAR(20)     NOT NULL,
    [HasFencedYard]     BIT              NOT NULL DEFAULT 0,
    [HasOtherPets]      BIT              NOT NULL DEFAULT 0,
    [HouseholdAdults]   INT              NOT NULL DEFAULT 1,
    [HouseholdChildren] INT              NOT NULL DEFAULT 0,
    [IsFosterApproved]  BIT              NOT NULL DEFAULT 0,
    [DateRegistered]    DATE             NOT NULL,
    [Notes]             NVARCHAR(MAX)    NULL,
    CONSTRAINT [PK_DS_Adopter] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [UQ_DS_Adopter_Email] UNIQUE ([Email]),
    CONSTRAINT [CK_DS_Adopter_HousingType] CHECK ([HousingType] IN ('House', 'Apartment', 'Condo', 'Townhouse', 'Farm')),
    CONSTRAINT [CK_DS_Adopter_Household]   CHECK ([HouseholdAdults] >= 1 AND [HouseholdChildren] >= 0)
);
PRINT '  Created [DogShelter].[Adopter]';

-- ---------------------------------------------------------------------------
-- Trait: tag vocabulary applied to dogs via the DogTrait junction.
-- ---------------------------------------------------------------------------
CREATE TABLE [DogShelter].[Trait] (
    [ID]          UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [Name]        NVARCHAR(100)    NOT NULL,
    [Category]    NVARCHAR(30)     NOT NULL,
    [Description] NVARCHAR(500)    NULL,
    CONSTRAINT [PK_DS_Trait] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [UQ_DS_Trait_Name] UNIQUE ([Name]),
    CONSTRAINT [CK_DS_Trait_Category] CHECK ([Category] IN ('Temperament', 'Training', 'Special Needs', 'Activity'))
);
PRINT '  Created [DogShelter].[Trait]';

-- ---------------------------------------------------------------------------
-- Dog: the star of the demo.
--
--   * PrimaryBreedID and SecondaryBreedID are TWO FKs TO THE SAME TABLE. This is the
--     sleeper teaching moment — CodeGen has to name the two virtual fields distinctly,
--     and Breed ends up with two separate related-record tabs. Everyone hits this on
--     day one of a real project.
--
--   * MotherID is a self-referencing FK, used for litters born in care.
--
--   * GoodWithDogs / GoodWithCats / GoodWithKids are NULLABLE bits on purpose — a shelter
--     genuinely does not know yet, and NULL means "not assessed", not "no".
--
--   * EstimatedAgeMonths and DaysInCare are NON-PERSISTED computed columns. They use
--     GETDATE(), so SQL Server will not let them be persisted or indexed. CodeGen surfaces
--     them as read-only fields, which teaches that CodeGen reads the DATABASE as truth
--     rather than a config file someone remembered to update.
-- ---------------------------------------------------------------------------
CREATE TABLE [DogShelter].[Dog] (
    [ID]                 UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [Name]               NVARCHAR(100)    NOT NULL,
    [ShelterID]          UNIQUEIDENTIFIER NOT NULL,
    [PrimaryBreedID]     UNIQUEIDENTIFIER NOT NULL,
    [SecondaryBreedID]   UNIQUEIDENTIFIER NULL,
    [MotherID]           UNIQUEIDENTIFIER NULL,
    [Sex]                NVARCHAR(10)     NOT NULL,
    [EstimatedBirthDate] DATE             NULL,
    [EstimatedAgeMonths] AS (DATEDIFF(MONTH, [EstimatedBirthDate], GETDATE())),
    [WeightLbs]          DECIMAL(6,2)     NULL,
    [Color]              NVARCHAR(100)    NULL,
    [MicrochipNumber]    NVARCHAR(50)     NULL,
    [IntakeDate]         DATE             NOT NULL,
    [IntakeType]         NVARCHAR(30)     NOT NULL,
    [Status]             NVARCHAR(30)     NOT NULL DEFAULT 'Intake',
    [OutcomeDate]        DATE             NULL,
    [DaysInCare]         AS (DATEDIFF(DAY, [IntakeDate], ISNULL([OutcomeDate], CAST(GETDATE() AS DATE)))),
    [IsSpayedNeutered]   BIT              NOT NULL DEFAULT 0,
    [IsHouseTrained]     BIT              NOT NULL DEFAULT 0,
    [GoodWithDogs]       BIT              NULL,
    [GoodWithCats]       BIT              NULL,
    [GoodWithKids]       BIT              NULL,
    [AdoptionFee]        DECIMAL(10,2)    NOT NULL DEFAULT 0,
    [Bio]                NVARCHAR(MAX)    NULL,
    [PhotoURL]           NVARCHAR(1000)   NULL,
    CONSTRAINT [PK_DS_Dog] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [UQ_DS_Dog_MicrochipNumber] UNIQUE ([MicrochipNumber]),
    CONSTRAINT [FK_DS_Dog_Shelter]        FOREIGN KEY ([ShelterID])        REFERENCES [DogShelter].[Shelter]([ID]),
    CONSTRAINT [FK_DS_Dog_PrimaryBreed]   FOREIGN KEY ([PrimaryBreedID])   REFERENCES [DogShelter].[Breed]([ID]),
    CONSTRAINT [FK_DS_Dog_SecondaryBreed] FOREIGN KEY ([SecondaryBreedID]) REFERENCES [DogShelter].[Breed]([ID]),
    CONSTRAINT [FK_DS_Dog_Mother]         FOREIGN KEY ([MotherID])         REFERENCES [DogShelter].[Dog]([ID]),
    CONSTRAINT [CK_DS_Dog_Sex]        CHECK ([Sex]        IN ('Male', 'Female')),
    CONSTRAINT [CK_DS_Dog_IntakeType] CHECK ([IntakeType] IN ('Stray', 'Owner Surrender', 'Transfer', 'Born In Care', 'Return')),
    CONSTRAINT [CK_DS_Dog_Status]     CHECK ([Status]     IN ('Intake', 'Available', 'Pending', 'Fostered',
                                                              'Medical Hold', 'Adopted', 'Transferred')),
    CONSTRAINT [CK_DS_Dog_AdoptionFee]  CHECK ([AdoptionFee] >= 0),
    CONSTRAINT [CK_DS_Dog_OutcomeDate]  CHECK ([OutcomeDate] IS NULL OR [OutcomeDate] >= [IntakeDate]),
    CONSTRAINT [CK_DS_Dog_DifferentBreeds] CHECK ([SecondaryBreedID] IS NULL OR [SecondaryBreedID] <> [PrimaryBreedID])
);
PRINT '  Created [DogShelter].[Dog]';

-- ---------------------------------------------------------------------------
-- AdoptionApplication: many-to-many between Dog and Adopter, WITH attributes.
-- Together with FosterPlacement below, this gives Dog and Adopter TWO different
-- relationships to each other — the case that confuses people the first time they
-- meet a metadata-driven UI, which is exactly why it belongs in the demo.
-- ---------------------------------------------------------------------------
CREATE TABLE [DogShelter].[AdoptionApplication] (
    [ID]                UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [DogID]             UNIQUEIDENTIFIER NOT NULL,
    [AdopterID]         UNIQUEIDENTIFIER NOT NULL,
    [SubmittedAt]       DATETIMEOFFSET   NOT NULL,
    [Status]            NVARCHAR(30)     NOT NULL DEFAULT 'Submitted',
    [ReviewedByStaffID] UNIQUEIDENTIFIER NULL,
    [ReviewedAt]        DATETIMEOFFSET   NULL,
    [HomeVisitDate]     DATE             NULL,
    [DecisionNotes]     NVARCHAR(MAX)    NULL,
    [AdoptionDate]      DATE             NULL,
    [FeePaid]           DECIMAL(10,2)    NULL,
    CONSTRAINT [PK_DS_AdoptionApplication] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_DS_AdoptionApplication_Dog]     FOREIGN KEY ([DogID])             REFERENCES [DogShelter].[Dog]([ID]),
    CONSTRAINT [FK_DS_AdoptionApplication_Adopter] FOREIGN KEY ([AdopterID])         REFERENCES [DogShelter].[Adopter]([ID]),
    CONSTRAINT [FK_DS_AdoptionApplication_Staff]   FOREIGN KEY ([ReviewedByStaffID]) REFERENCES [DogShelter].[Staff]([ID]),
    CONSTRAINT [CK_DS_AdoptionApplication_Status] CHECK ([Status] IN ('Submitted', 'Under Review', 'Approved',
                                                                     'Denied', 'Withdrawn', 'Completed')),
    CONSTRAINT [CK_DS_AdoptionApplication_FeePaid] CHECK ([FeePaid] IS NULL OR [FeePaid] >= 0)
);
PRINT '  Created [DogShelter].[AdoptionApplication]';

-- ---------------------------------------------------------------------------
-- FosterPlacement: the SECOND many-to-many between Dog and Adopter.
-- ---------------------------------------------------------------------------
CREATE TABLE [DogShelter].[FosterPlacement] (
    [ID]              UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [DogID]           UNIQUEIDENTIFIER NOT NULL,
    [FosterAdopterID] UNIQUEIDENTIFIER NOT NULL,
    [StartDate]       DATE             NOT NULL,
    [EndDate]         DATE             NULL,
    [Status]          NVARCHAR(20)     NOT NULL DEFAULT 'Active',
    [Reason]          NVARCHAR(200)    NULL,
    [Notes]           NVARCHAR(MAX)    NULL,
    CONSTRAINT [PK_DS_FosterPlacement] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_DS_FosterPlacement_Dog]     FOREIGN KEY ([DogID])           REFERENCES [DogShelter].[Dog]([ID]),
    CONSTRAINT [FK_DS_FosterPlacement_Adopter] FOREIGN KEY ([FosterAdopterID]) REFERENCES [DogShelter].[Adopter]([ID]),
    CONSTRAINT [CK_DS_FosterPlacement_Status]  CHECK ([Status] IN ('Active', 'Completed', 'Ended Early')),
    CONSTRAINT [CK_DS_FosterPlacement_Dates]   CHECK ([EndDate] IS NULL OR [EndDate] >= [StartDate])
);
PRINT '  Created [DogShelter].[FosterPlacement]';

-- ---------------------------------------------------------------------------
-- MedicalRecord: child timeline records. Money + dates give charts something real.
-- ---------------------------------------------------------------------------
CREATE TABLE [DogShelter].[MedicalRecord] (
    [ID]                   UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [DogID]                UNIQUEIDENTIFIER NOT NULL,
    [RecordDate]           DATE             NOT NULL,
    [RecordType]           NVARCHAR(30)     NOT NULL,
    [Description]          NVARCHAR(500)    NOT NULL,
    [VeterinarianStaffID]  UNIQUEIDENTIFIER NULL,
    [Cost]                 DECIMAL(10,2)    NOT NULL DEFAULT 0,
    [FollowUpDate]         DATE             NULL,
    [Notes]                NVARCHAR(MAX)    NULL,
    CONSTRAINT [PK_DS_MedicalRecord] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_DS_MedicalRecord_Dog]   FOREIGN KEY ([DogID])               REFERENCES [DogShelter].[Dog]([ID]),
    CONSTRAINT [FK_DS_MedicalRecord_Staff] FOREIGN KEY ([VeterinarianStaffID]) REFERENCES [DogShelter].[Staff]([ID]),
    CONSTRAINT [CK_DS_MedicalRecord_RecordType] CHECK ([RecordType] IN ('Vaccination', 'Exam', 'Surgery',
                                                                       'Treatment', 'Test', 'Dental')),
    CONSTRAINT [CK_DS_MedicalRecord_Cost] CHECK ([Cost] >= 0)
);
PRINT '  Created [DogShelter].[MedicalRecord]';

-- ---------------------------------------------------------------------------
-- DogTrait: a PURE junction table -> renders as tag-style UI.
-- ---------------------------------------------------------------------------
CREATE TABLE [DogShelter].[DogTrait] (
    [ID]                UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [DogID]             UNIQUEIDENTIFIER NOT NULL,
    [TraitID]           UNIQUEIDENTIFIER NOT NULL,
    [AssignedByStaffID] UNIQUEIDENTIFIER NULL,
    [AssignedAt]        DATETIMEOFFSET   NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    [Notes]             NVARCHAR(500)    NULL,
    CONSTRAINT [PK_DS_DogTrait] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [UQ_DS_DogTrait_DogTrait] UNIQUE ([DogID], [TraitID]),
    CONSTRAINT [FK_DS_DogTrait_Dog]   FOREIGN KEY ([DogID])             REFERENCES [DogShelter].[Dog]([ID]),
    CONSTRAINT [FK_DS_DogTrait_Trait] FOREIGN KEY ([TraitID])           REFERENCES [DogShelter].[Trait]([ID]),
    CONSTRAINT [FK_DS_DogTrait_Staff] FOREIGN KEY ([AssignedByStaffID]) REFERENCES [DogShelter].[Staff]([ID])
);
PRINT '  Created [DogShelter].[DogTrait]';
GO

-- =============================================================================================================
-- PHASE 3: EXTENDED PROPERTIES (documentation)
--
-- Every table and every column gets an MS_Description. This is not decoration:
--   * MJ imports them as Entity.Description and EntityField.Description during CodeGen
--   * Explorer renders them as field tooltips and column help
--   * AI agents receive them as schema context, which is what lets an agent answer
--     "which dogs have been waiting longest without an application" without being told
--     what any of these columns mean
--
-- Live A/B worth doing: delete the description on Dog.Status, re-run CodeGen, and ask the
-- agent a status question. Then put it back and ask again.
-- =============================================================================================================
PRINT '=== Phase 3: Adding extended properties ===';
GO

-- ---- Shelter ----
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'A physical shelter location that houses dogs. Root entity of the DogShelter demo schema - staff and dogs both belong to exactly one shelter.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Shelter';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Unique identifier for the shelter location.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Shelter', @level2type=N'COLUMN', @level2name=N'ID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Public-facing name of the shelter. Unique across all locations.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Shelter', @level2type=N'COLUMN', @level2name=N'Name';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Street address of the shelter.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Shelter', @level2type=N'COLUMN', @level2name=N'AddressLine1';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'City where the shelter is located.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Shelter', @level2type=N'COLUMN', @level2name=N'City';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'State or province where the shelter is located.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Shelter', @level2type=N'COLUMN', @level2name=N'State';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Postal or ZIP code of the shelter address.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Shelter', @level2type=N'COLUMN', @level2name=N'PostalCode';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Main public phone number for adoption inquiries.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Shelter', @level2type=N'COLUMN', @level2name=N'Phone';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'General contact email address for the shelter.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Shelter', @level2type=N'COLUMN', @level2name=N'Email';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Maximum number of dogs the shelter can physically house at one time. Used as the denominator when calculating occupancy.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Shelter', @level2type=N'COLUMN', @level2name=N'KennelCapacity';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Date this shelter location opened.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Shelter', @level2type=N'COLUMN', @level2name=N'OpenedDate';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When 0, the shelter is at or over capacity and is temporarily refusing new intakes.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Shelter', @level2type=N'COLUMN', @level2name=N'IsAcceptingIntakes';
GO

-- ---- Breed ----
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Reference list of dog breeds with typical size, energy, and grooming characteristics. Referenced twice by Dog - once as primary breed and once as secondary breed for mixes.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Breed';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Unique identifier for the breed.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Breed', @level2type=N'COLUMN', @level2name=N'ID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Common name of the breed, for example Labrador Retriever. Includes a Mixed Breed entry for dogs of unknown ancestry.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Breed', @level2type=N'COLUMN', @level2name=N'Name';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Size class of the breed. One of: Toy, Small, Medium, Large, Giant.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Breed', @level2type=N'COLUMN', @level2name=N'SizeCategory';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Low end of the typical healthy adult weight range, in pounds.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Breed', @level2type=N'COLUMN', @level2name=N'TypicalWeightLbsLow';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'High end of the typical healthy adult weight range, in pounds. Always greater than or equal to TypicalWeightLbsLow.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Breed', @level2type=N'COLUMN', @level2name=N'TypicalWeightLbsHigh';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'How much daily exercise the breed typically needs. One of: Low, Moderate, High, Very High. Adoption counselors use this to match dogs to households.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Breed', @level2type=N'COLUMN', @level2name=N'EnergyLevel';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Typical grooming burden for the breed. One of: Minimal, Moderate, High.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Breed', @level2type=N'COLUMN', @level2name=N'GroomingNeeds';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Typical lifespan of the breed in years.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Breed', @level2type=N'COLUMN', @level2name=N'TypicalLifespanYears';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Narrative description of the breed temperament and typical care needs.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Breed', @level2type=N'COLUMN', @level2name=N'Description';
GO

-- ---- Staff ----
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Shelter employees and volunteers. Self-referencing through SupervisorID to form a reporting hierarchy.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Staff';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Unique identifier for the staff member.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Staff', @level2type=N'COLUMN', @level2name=N'ID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The shelter location this person works at.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Staff', @level2type=N'COLUMN', @level2name=N'ShelterID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Given name of the staff member.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Staff', @level2type=N'COLUMN', @level2name=N'FirstName';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Family name of the staff member.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Staff', @level2type=N'COLUMN', @level2name=N'LastName';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'PERSISTED computed column: FirstName plus a space plus LastName. Read-only. Serves as the human-readable display value wherever a staff member is referenced.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Staff', @level2type=N'COLUMN', @level2name=N'FullName';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Work email address. Unique across all staff.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Staff', @level2type=N'COLUMN', @level2name=N'Email';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Contact phone number for the staff member.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Staff', @level2type=N'COLUMN', @level2name=N'Phone';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Job function. One of: Shelter Manager, Adoption Counselor, Veterinarian, Vet Tech, Kennel Attendant, Volunteer Coordinator, Volunteer. Only Veterinarian and Vet Tech records appear as the vet on a medical record.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Staff', @level2type=N'COLUMN', @level2name=N'Role';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Date the person started working or volunteering at the shelter.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Staff', @level2type=N'COLUMN', @level2name=N'HireDate';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When 0, the person no longer works at the shelter. Historical records still reference them, so rows are deactivated rather than deleted.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Staff', @level2type=N'COLUMN', @level2name=N'IsActive';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'SELF-REFERENCING foreign key to the staff member this person reports to. NULL for the shelter manager at the top of each location hierarchy.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Staff', @level2type=N'COLUMN', @level2name=N'SupervisorID';
GO

-- ---- Adopter ----
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'People who adopt or foster dogs. The same person can appear on adoption applications and on foster placements, which is why Dog and Adopter have two distinct relationships to each other.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Adopter';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Unique identifier for the adopter.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Adopter', @level2type=N'COLUMN', @level2name=N'ID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Given name of the adopter.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Adopter', @level2type=N'COLUMN', @level2name=N'FirstName';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Family name of the adopter.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Adopter', @level2type=N'COLUMN', @level2name=N'LastName';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'PERSISTED computed column: FirstName plus a space plus LastName. Read-only display value.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Adopter', @level2type=N'COLUMN', @level2name=N'FullName';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Primary email address. Unique - the shelter uses it to detect repeat applicants.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Adopter', @level2type=N'COLUMN', @level2name=N'Email';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Contact phone number for the adopter.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Adopter', @level2type=N'COLUMN', @level2name=N'Phone';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Home street address, used for home visits.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Adopter', @level2type=N'COLUMN', @level2name=N'AddressLine1';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'City of the adopter home address.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Adopter', @level2type=N'COLUMN', @level2name=N'City';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'State or province of the adopter home address.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Adopter', @level2type=N'COLUMN', @level2name=N'State';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Postal or ZIP code of the adopter home address.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Adopter', @level2type=N'COLUMN', @level2name=N'PostalCode';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Type of home. One of: House, Apartment, Condo, Townhouse, Farm. Combined with HasFencedYard when matching high-energy dogs.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Adopter', @level2type=N'COLUMN', @level2name=N'HousingType';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether the property has a securely fenced yard. Required for some dogs.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Adopter', @level2type=N'COLUMN', @level2name=N'HasFencedYard';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether the household already has other pets. Relevant to dogs flagged GoodWithDogs or GoodWithCats = 0.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Adopter', @level2type=N'COLUMN', @level2name=N'HasOtherPets';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Number of adults living in the household.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Adopter', @level2type=N'COLUMN', @level2name=N'HouseholdAdults';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Number of children living in the household. Relevant to dogs flagged GoodWithKids = 0.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Adopter', @level2type=N'COLUMN', @level2name=N'HouseholdChildren';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether this person has completed foster training and may take foster placements.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Adopter', @level2type=N'COLUMN', @level2name=N'IsFosterApproved';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Date the person first registered with the shelter.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Adopter', @level2type=N'COLUMN', @level2name=N'DateRegistered';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Free-form staff notes about the adopter.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Adopter', @level2type=N'COLUMN', @level2name=N'Notes';
GO

-- ---- Trait ----
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Controlled vocabulary of behavioral and care tags that can be applied to dogs through the DogTrait junction table.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Trait';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Unique identifier for the trait.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Trait', @level2type=N'COLUMN', @level2name=N'ID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Short label shown as a tag on the dog record, for example Loves Car Rides.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Trait', @level2type=N'COLUMN', @level2name=N'Name';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Grouping for the trait. One of: Temperament, Training, Special Needs, Activity.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Trait', @level2type=N'COLUMN', @level2name=N'Category';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Explanation of what the trait means and how staff should apply it.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Trait', @level2type=N'COLUMN', @level2name=N'Description';
GO

-- ---- Dog ----
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The central entity of the shelter. One row per dog in the care of the organization, past or present. A dog stays in this table after adoption - Status and OutcomeDate record what happened rather than the row being deleted.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Dog';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Unique identifier for the dog.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Dog', @level2type=N'COLUMN', @level2name=N'ID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Name the shelter uses for the dog. Assigned by staff on intake for strays.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Dog', @level2type=N'COLUMN', @level2name=N'Name';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The shelter location currently responsible for this dog.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Dog', @level2type=N'COLUMN', @level2name=N'ShelterID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Best-guess primary breed. One of TWO foreign keys from this table to Breed - see also SecondaryBreedID.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Dog', @level2type=N'COLUMN', @level2name=N'PrimaryBreedID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Second breed for a mixed-breed dog, or NULL if the dog appears purebred or the mix is unknown. The SECOND foreign key from this table to Breed. Always different from PrimaryBreedID.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Dog', @level2type=N'COLUMN', @level2name=N'SecondaryBreedID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'SELF-REFERENCING foreign key to the mother of this dog, populated only for puppies born in shelter care. NULL for every dog that arrived from outside.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Dog', @level2type=N'COLUMN', @level2name=N'MotherID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Sex of the dog. One of: Male, Female.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Dog', @level2type=N'COLUMN', @level2name=N'Sex';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Estimated date of birth. For strays this is a veterinary estimate from dentition, not a known date.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Dog', @level2type=N'COLUMN', @level2name=N'EstimatedBirthDate';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'COMPUTED, NOT PERSISTED: whole months between EstimatedBirthDate and today. Read-only and recalculated on every read, so it cannot be indexed.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Dog', @level2type=N'COLUMN', @level2name=N'EstimatedAgeMonths';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Most recent recorded weight in pounds.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Dog', @level2type=N'COLUMN', @level2name=N'WeightLbs';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Coat color and pattern as described by staff, for example Black and White or Brindle.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Dog', @level2type=N'COLUMN', @level2name=N'Color';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Implanted microchip number. Unique when present, NULL for dogs not yet chipped.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Dog', @level2type=N'COLUMN', @level2name=N'MicrochipNumber';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Date the dog entered the care of the shelter. The clock that length-of-stay is measured from.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Dog', @level2type=N'COLUMN', @level2name=N'IntakeDate';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'How the dog arrived. One of: Stray, Owner Surrender, Transfer, Born In Care, Return. Return means a previously adopted dog came back.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Dog', @level2type=N'COLUMN', @level2name=N'IntakeType';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Current disposition. One of: Intake, Available, Pending, Fostered, Medical Hold, Adopted, Transferred. Only Available dogs are shown to the public; Pending means an approved application is in progress. Adopted and Transferred are terminal and always have an OutcomeDate.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Dog', @level2type=N'COLUMN', @level2name=N'Status';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Date the dog left the care of the shelter through adoption or transfer. NULL while the dog is still in care. Never earlier than IntakeDate.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Dog', @level2type=N'COLUMN', @level2name=N'OutcomeDate';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'COMPUTED, NOT PERSISTED: days between IntakeDate and OutcomeDate, or between IntakeDate and today for a dog still in care. This is the length-of-stay metric the shelter manages against.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Dog', @level2type=N'COLUMN', @level2name=N'DaysInCare';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether the dog has been spayed or neutered. Must be 1 before an adoption can be finalized.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Dog', @level2type=N'COLUMN', @level2name=N'IsSpayedNeutered';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether the dog is reliably house trained.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Dog', @level2type=N'COLUMN', @level2name=N'IsHouseTrained';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'TRI-STATE: 1 = tested and does well with other dogs, 0 = tested and does not, NULL = not yet assessed. NULL is meaningfully different from 0 and must not be treated as a no.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Dog', @level2type=N'COLUMN', @level2name=N'GoodWithDogs';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'TRI-STATE: 1 = tested and does well with cats, 0 = tested and does not, NULL = not yet assessed.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Dog', @level2type=N'COLUMN', @level2name=N'GoodWithCats';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'TRI-STATE: 1 = tested and does well with children, 0 = tested and does not, NULL = not yet assessed.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Dog', @level2type=N'COLUMN', @level2name=N'GoodWithKids';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Adoption fee in dollars. Typically lower for large, senior, or long-stay dogs to encourage placement.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Dog', @level2type=N'COLUMN', @level2name=N'AdoptionFee';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Public-facing narrative used on the adoption listing.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Dog', @level2type=N'COLUMN', @level2name=N'Bio';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'URL of the primary adoption listing photo.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'Dog', @level2type=N'COLUMN', @level2name=N'PhotoURL';
GO

-- ---- AdoptionApplication ----
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'An application by one adopter to adopt one dog, with the review workflow attached. This is the FIRST of two many-to-many relationships between Dog and Adopter; the other is FosterPlacement.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'AdoptionApplication';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Unique identifier for the application.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'AdoptionApplication', @level2type=N'COLUMN', @level2name=N'ID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The dog being applied for. A dog can receive several competing applications.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'AdoptionApplication', @level2type=N'COLUMN', @level2name=N'DogID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The person applying.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'AdoptionApplication', @level2type=N'COLUMN', @level2name=N'AdopterID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When the application was submitted.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'AdoptionApplication', @level2type=N'COLUMN', @level2name=N'SubmittedAt';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Workflow state. One of: Submitted, Under Review, Approved, Denied, Withdrawn, Completed. Completed means the adoption actually happened and AdoptionDate is set.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'AdoptionApplication', @level2type=N'COLUMN', @level2name=N'Status';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The staff member who reviewed the application, normally an Adoption Counselor. NULL while the application is still unreviewed.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'AdoptionApplication', @level2type=N'COLUMN', @level2name=N'ReviewedByStaffID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When the review decision was recorded.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'AdoptionApplication', @level2type=N'COLUMN', @level2name=N'ReviewedAt';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Date of the in-home visit, where the process requires one.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'AdoptionApplication', @level2type=N'COLUMN', @level2name=N'HomeVisitDate';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Staff rationale for the approval or denial.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'AdoptionApplication', @level2type=N'COLUMN', @level2name=N'DecisionNotes';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Date the adoption was finalized. Set only on Completed applications and matches the OutcomeDate on the dog.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'AdoptionApplication', @level2type=N'COLUMN', @level2name=N'AdoptionDate';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Adoption fee actually collected, which may differ from the listed fee after a waiver or promotion.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'AdoptionApplication', @level2type=N'COLUMN', @level2name=N'FeePaid';
GO

-- ---- FosterPlacement ----
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'A temporary placement of a dog in a foster home. This is the SECOND many-to-many relationship between Dog and Adopter, which is why each of those entities ends up with two related-record tabs pointing at the other.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'FosterPlacement';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Unique identifier for the foster placement.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'FosterPlacement', @level2type=N'COLUMN', @level2name=N'ID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The dog placed in foster care.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'FosterPlacement', @level2type=N'COLUMN', @level2name=N'DogID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The foster caregiver. Points at Adopter, and that person normally has IsFosterApproved = 1.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'FosterPlacement', @level2type=N'COLUMN', @level2name=N'FosterAdopterID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Date the dog went into the foster home.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'FosterPlacement', @level2type=N'COLUMN', @level2name=N'StartDate';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Date the placement ended. NULL while the placement is still Active. Never earlier than StartDate.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'FosterPlacement', @level2type=N'COLUMN', @level2name=N'EndDate';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'State of the placement. One of: Active, Completed, Ended Early. Ended Early means the placement was cut short, usually for a behavioral or medical reason.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'FosterPlacement', @level2type=N'COLUMN', @level2name=N'Status';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Why the dog was placed in foster care, for example post-surgery recovery or kennel stress.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'FosterPlacement', @level2type=N'COLUMN', @level2name=N'Reason';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Notes from the foster caregiver about how the dog behaves in a home.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'FosterPlacement', @level2type=N'COLUMN', @level2name=N'Notes';
GO

-- ---- MedicalRecord ----
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'One entry in the medical history of a dog. Many rows per dog, forming a timeline from intake exam through vaccinations and any surgery.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'MedicalRecord';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Unique identifier for the medical record entry.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'MedicalRecord', @level2type=N'COLUMN', @level2name=N'ID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The dog this record belongs to.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'MedicalRecord', @level2type=N'COLUMN', @level2name=N'DogID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Date the procedure or observation took place.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'MedicalRecord', @level2type=N'COLUMN', @level2name=N'RecordDate';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Kind of medical event. One of: Vaccination, Exam, Surgery, Treatment, Test, Dental.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'MedicalRecord', @level2type=N'COLUMN', @level2name=N'RecordType';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Short description of what was done, for example DHPP booster or dental cleaning with two extractions.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'MedicalRecord', @level2type=N'COLUMN', @level2name=N'Description';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The Veterinarian or Vet Tech who performed the work. NULL for records entered from an outside clinic.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'MedicalRecord', @level2type=N'COLUMN', @level2name=N'VeterinarianStaffID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Cost of the procedure in dollars. Summed per dog to understand the true cost of care.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'MedicalRecord', @level2type=N'COLUMN', @level2name=N'Cost';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Date a follow-up is due, for example the next booster. NULL when no follow-up is needed.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'MedicalRecord', @level2type=N'COLUMN', @level2name=N'FollowUpDate';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Additional clinical notes.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'MedicalRecord', @level2type=N'COLUMN', @level2name=N'Notes';
GO

-- ---- DogTrait ----
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'PURE JUNCTION TABLE joining Dog and Trait. Each row means one dog has been tagged with one trait. The unique constraint on DogID plus TraitID prevents the same tag being applied twice.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'DogTrait';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Unique identifier for the dog-trait assignment.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'DogTrait', @level2type=N'COLUMN', @level2name=N'ID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The dog being tagged.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'DogTrait', @level2type=N'COLUMN', @level2name=N'DogID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The trait being applied.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'DogTrait', @level2type=N'COLUMN', @level2name=N'TraitID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The staff member who observed and recorded the trait.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'DogTrait', @level2type=N'COLUMN', @level2name=N'AssignedByStaffID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When the trait was assigned.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'DogTrait', @level2type=N'COLUMN', @level2name=N'AssignedAt';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Context for the tag, for example the specific situation where the behavior was observed.',
    @level0type=N'SCHEMA', @level0name=N'DogShelter', @level1type=N'TABLE', @level1name=N'DogTrait', @level2type=N'COLUMN', @level2name=N'Notes';
GO

PRINT '  Extended properties added for 10 tables and 112 columns';
GO

-- =============================================================================================================
-- PHASE 4: SAMPLE DATA
--
-- Reference data (shelters, breeds, traits, staff) is written out literally so it can be read
-- and edited during class. The high-volume tables (dogs, applications, medical records, tags)
-- are generated set-based from a deterministic ordinal, so the numbers are stable: every
-- attendee ends up with the same 120 dogs and the same counts.
--
-- All dates are relative to GETDATE(), so the data always looks recent.
-- =============================================================================================================
PRINT '=== Phase 4: Loading sample data ===';
GO

-- ---- Shelters (3) ----
INSERT INTO [DogShelter].[Shelter] ([Name],[AddressLine1],[City],[State],[PostalCode],[Phone],[Email],[KennelCapacity],[OpenedDate],[IsAcceptingIntakes])
VALUES
    (N'Harbor Paws Adoption Center', N'2201 Boston St',       N'Baltimore', N'MD', N'21231', N'410-555-0119', N'info@harborpaws.example.org',        35, '2018-06-11', 0),
    (N'Riverside Animal Shelter',    N'88 SE Water Ave',      N'Portland',  N'OR', N'97214', N'503-555-0177', N'hello@riversideanimals.example.org', 45, '2014-09-02', 1),
    (N'Second Chance Dog Rescue',    N'1400 Barton Springs Rd', N'Austin',  N'TX', N'78704', N'512-555-0142', N'adopt@secondchancedogs.example.org', 60, '2009-04-18', 1);
PRINT '  Loaded 3 shelters';
GO

-- ---- Breeds (24) ----
INSERT INTO [DogShelter].[Breed] ([Name],[SizeCategory],[TypicalWeightLbsLow],[TypicalWeightLbsHigh],[EnergyLevel],[GroomingNeeds],[TypicalLifespanYears],[Description])
VALUES
    (N'Australian Shepherd',    N'Medium', 40,  65,  N'Very High', N'Moderate', 13, N'Herding dog that needs a job to do. Thrives with active owners and struggles in low-stimulation homes.'),
    (N'Basset Hound',           N'Medium', 40,  65,  N'Low',       N'Moderate', 11, N'Scent hound with a famously loud voice and a stubborn streak. Content with moderate walks.'),
    (N'Beagle',                 N'Small',  20,  30,  N'Moderate',  N'Minimal',  13, N'Friendly, food-motivated scent hound. Needs a secure yard because a nose on a trail ignores recall.'),
    (N'Bernese Mountain Dog',   N'Giant',  70,  115, N'Moderate',  N'High',     8,  N'Gentle giant with a heavy coat. Prone to joint issues, so weight management matters.'),
    (N'Border Collie',          N'Medium', 30,  55,  N'Very High', N'Moderate', 13, N'Widely considered the most trainable breed, which also means the most easily bored.'),
    (N'Boxer',                  N'Large',  50,  80,  N'High',      N'Minimal',  11, N'Playful and people-oriented, staying puppyish well into adulthood.'),
    (N'Chihuahua',              N'Toy',    4,   8,   N'Moderate',  N'Minimal',  15, N'Long-lived toy breed, deeply bonded to one person. Often overwhelmed by young children.'),
    (N'Cocker Spaniel',         N'Medium', 20,  30,  N'Moderate',  N'High',     13, N'Affectionate sporting breed with ears that need routine cleaning to avoid infection.'),
    (N'Dachshund',              N'Small',  11,  32,  N'Moderate',  N'Minimal',  14, N'Bold and burrow-driven. Long back means stairs and jumping should be limited.'),
    (N'French Bulldog',         N'Small',  16,  28,  N'Low',       N'Minimal',  11, N'Companion breed that does well in apartments. Heat intolerant and should not be over-exercised.'),
    (N'German Shepherd',        N'Large',  50,  90,  N'High',      N'High',     11, N'Confident working breed, highly trainable, needs structure and early socialization.'),
    (N'Golden Retriever',       N'Large',  55,  75,  N'High',      N'High',     11, N'Patient family dog and the most reliably kid-tolerant breed in the shelter.'),
    (N'Great Dane',             N'Giant',  110, 175, N'Moderate',  N'Minimal',  8,  N'Enormous but surprisingly low-key indoors. Short lifespan and high food cost.'),
    (N'Jack Russell Terrier',   N'Small',  13,  17,  N'Very High', N'Minimal',  14, N'Small dog with an enormous engine. Frequently returned by owners who underestimated it.'),
    (N'Labrador Retriever',     N'Large',  55,  80,  N'High',      N'Moderate', 12, N'The most common dog in shelter care. Sociable, food-driven, and easy to place.'),
    (N'Mastiff',                N'Giant',  120, 230, N'Low',       N'Minimal',  8,  N'Calm and protective. Space and strength make placement genuinely difficult.'),
    (N'Mixed Breed',            N'Medium', 20,  70,  N'Moderate',  N'Moderate', 13, N'Used when ancestry is unknown or genuinely mixed. The most common primary breed in the shelter.'),
    (N'Pembroke Welsh Corgi',   N'Small',  22,  30,  N'Moderate',  N'Moderate', 13, N'Herding instinct in a short frame. Sheds heavily year round.'),
    (N'Pit Bull Terrier',       N'Medium', 30,  65,  N'High',      N'Minimal',  13, N'Affectionate and strong. Faces housing and insurance restrictions that lengthen shelter stays.'),
    (N'Poodle (Standard)',      N'Large',  40,  70,  N'High',      N'High',     13, N'Highly intelligent, low-shedding, and requires professional grooming every six to eight weeks.'),
    (N'Rottweiler',             N'Large',  80,  135, N'Moderate',  N'Minimal',  9,  N'Steady guardian breed. Needs a confident owner and consistent training.'),
    (N'Shiba Inu',              N'Small',  17,  23,  N'Moderate',  N'Moderate', 14, N'Independent and cat-like. Notorious escape artist and rarely reliable off leash.'),
    (N'Shih Tzu',               N'Toy',    9,   16,  N'Low',       N'High',     14, N'Companion lap dog. Coat mats quickly without regular grooming.'),
    (N'Siberian Husky',         N'Medium', 35,  60,  N'Very High', N'High',      13, N'Endurance breed with a strong prey drive. Commonly surrendered for escaping and for vocalizing.');
PRINT '  Loaded 24 breeds';
GO

-- ---- Traits (16) ----
INSERT INTO [DogShelter].[Trait] ([Name],[Category],[Description])
VALUES
    (N'Gentle',                   N'Temperament',   N'Consistently soft and careful around people, including strangers.'),
    (N'Shy',                      N'Temperament',   N'Slow to warm up. Needs a calm home and a patient adopter.'),
    (N'Confident',                N'Temperament',   N'Unbothered by noise, handling, and new environments.'),
    (N'Playful',                  N'Temperament',   N'Solicits play readily from people and from other dogs.'),
    (N'Velcro Dog',               N'Temperament',   N'Follows their person room to room. May develop separation anxiety if left alone for long days.'),
    (N'Knows Basic Commands',     N'Training',      N'Reliably responds to sit, stay, and come in a low-distraction setting.'),
    (N'House Trained',            N'Training',      N'Reliably signals to go outside and has no indoor accidents in foster care.'),
    (N'Crate Trained',            N'Training',      N'Settles calmly in a crate without vocalizing or attempting escape.'),
    (N'Leash Reactive',           N'Training',      N'Lunges or barks at other dogs while leashed. Needs an adopter willing to do management work.'),
    (N'Senior Care',              N'Special Needs', N'Seven years or older. Adopters should expect age-related veterinary costs.'),
    (N'Medication Required',      N'Special Needs', N'Needs ongoing daily medication that the adopter must commit to.'),
    (N'Needs Fenced Yard',        N'Special Needs', N'Escape risk or high prey drive. Adoption requires a securely fenced yard.'),
    (N'Only Dog Home',            N'Special Needs', N'Does not tolerate other dogs and must be the only dog in the household.'),
    (N'Loves Car Rides',          N'Activity',      N'Settles happily in a vehicle. Good fit for an adopter who travels.'),
    (N'High Energy Hiking Buddy', N'Activity',      N'Has the stamina for long trail days and needs real daily exercise.'),
    (N'Couch Potato',             N'Activity',      N'Content with short walks and long naps. Good fit for a low-activity home.');
PRINT '  Loaded 16 traits';
GO

-- ---- Staff (20) ----
INSERT INTO [DogShelter].[Staff] ([ShelterID],[FirstName],[LastName],[Email],[Phone],[Role],[HireDate],[IsActive])
SELECT s.[ID], v.[FirstName], v.[LastName], v.[Email], v.[Phone], v.[Role],
       DATEADD(DAY, -v.[DaysEmployed], CAST(GETDATE() AS DATE)), v.[IsActive]
FROM (VALUES
    (N'Second Chance Dog Rescue', N'Marcus',   N'Webb',      N'marcus.webb@secondchancedogs.example.org',     N'512-555-0201', N'Shelter Manager',      3200, 1),
    (N'Second Chance Dog Rescue', N'Elena',    N'Ruiz',      N'elena.ruiz@secondchancedogs.example.org',      N'512-555-0202', N'Veterinarian',         2400, 1),
    (N'Second Chance Dog Rescue', N'Priya',    N'Nair',      N'priya.nair@secondchancedogs.example.org',      N'512-555-0203', N'Adoption Counselor',   1500, 1),
    (N'Second Chance Dog Rescue', N'Danielle', N'Okafor',    N'danielle.okafor@secondchancedogs.example.org', N'512-555-0204', N'Adoption Counselor',   900,  1),
    (N'Second Chance Dog Rescue', N'Tomas',    N'Lindqvist', N'tomas.lindqvist@secondchancedogs.example.org', N'512-555-0205', N'Vet Tech',             1100, 1),
    (N'Second Chance Dog Rescue', N'Grace',    N'Kim',       N'grace.kim@secondchancedogs.example.org',       N'512-555-0206', N'Kennel Attendant',     600,  1),
    (N'Second Chance Dog Rescue', N'Andre',    N'Baptiste',  N'andre.baptiste@secondchancedogs.example.org',  N'512-555-0207', N'Kennel Attendant',     400,  1),
    (N'Second Chance Dog Rescue', N'Nora',     N'Feld',      N'nora.feld@secondchancedogs.example.org',       N'512-555-0208', N'Volunteer Coordinator',1800, 1),
    (N'Riverside Animal Shelter', N'Helen',    N'Nakamura',  N'helen.nakamura@riversideanimals.example.org',  N'503-555-0301', N'Shelter Manager',      2900, 1),
    (N'Riverside Animal Shelter', N'Owen',     N'Brennan',   N'owen.brennan@riversideanimals.example.org',    N'503-555-0302', N'Veterinarian',         2100, 1),
    (N'Riverside Animal Shelter', N'Sofia',    N'Marchetti', N'sofia.marchetti@riversideanimals.example.org', N'503-555-0303', N'Adoption Counselor',   1300, 1),
    (N'Riverside Animal Shelter', N'Jamal',    N'Whitfield', N'jamal.whitfield@riversideanimals.example.org', N'503-555-0304', N'Vet Tech',             800,  1),
    (N'Riverside Animal Shelter', N'Rita',     N'Solberg',   N'rita.solberg@riversideanimals.example.org',    N'503-555-0305', N'Kennel Attendant',     500,  1),
    (N'Riverside Animal Shelter', N'Peter',    N'Adeyemi',   N'peter.adeyemi@riversideanimals.example.org',   N'503-555-0306', N'Volunteer',            300,  1),
    (N'Riverside Animal Shelter', N'Claire',   N'Dubois',    N'claire.dubois@riversideanimals.example.org',   N'503-555-0307', N'Volunteer Coordinator',1600, 0),
    (N'Harbor Paws Adoption Center', N'Victor',  N'Ramos',   N'victor.ramos@harborpaws.example.org',          N'410-555-0401', N'Shelter Manager',      2200, 1),
    (N'Harbor Paws Adoption Center', N'Aisha',   N'Bello',   N'aisha.bello@harborpaws.example.org',           N'410-555-0402', N'Veterinarian',         1700, 1),
    (N'Harbor Paws Adoption Center', N'Liam',    N'Gallagher',N'liam.gallagher@harborpaws.example.org',       N'410-555-0403', N'Adoption Counselor',   1000, 1),
    (N'Harbor Paws Adoption Center', N'Yuki',    N'Tanaka',  N'yuki.tanaka@harborpaws.example.org',           N'410-555-0404', N'Vet Tech',             700,  1),
    (N'Harbor Paws Adoption Center', N'Bethany', N'Cole',    N'bethany.cole@harborpaws.example.org',          N'410-555-0405', N'Kennel Attendant',     350,  1)
) v([ShelterName],[FirstName],[LastName],[Email],[Phone],[Role],[DaysEmployed],[IsActive])
    INNER JOIN [DogShelter].[Shelter] s ON s.[Name] = v.[ShelterName];

-- Everyone reports to the Shelter Manager at their own location. Managers themselves have no supervisor,
-- which gives the self-referencing hierarchy exactly three roots.
UPDATE st
SET [SupervisorID] = mgr.[ID]
FROM [DogShelter].[Staff] st
    INNER JOIN [DogShelter].[Staff] mgr ON mgr.[ShelterID] = st.[ShelterID] AND mgr.[Role] = N'Shelter Manager'
WHERE st.[Role] <> N'Shelter Manager';
PRINT '  Loaded 20 staff and wired the supervisor hierarchy';
GO

-- ---- Adopters (60) ----
INSERT INTO [DogShelter].[Adopter] ([FirstName],[LastName],[Email],[Phone],[AddressLine1],[City],[State],[PostalCode],
                                    [HousingType],[HasFencedYard],[HasOtherPets],[HouseholdAdults],[HouseholdChildren],
                                    [IsFosterApproved],[DateRegistered])
SELECT
    v.[FirstName],
    v.[LastName],
    LOWER(v.[FirstName]) + N'.' + LOWER(v.[LastName]) + CAST(v.[Ordinal] AS NVARCHAR(4)) + N'@example.com',
    N'555-01' + RIGHT(N'00' + CAST(v.[Ordinal] AS NVARCHAR(4)), 2),
    CAST(100 + v.[Ordinal] * 7 AS NVARCHAR(10)) + N' ' +
        CASE v.[Ordinal] % 5 WHEN 0 THEN N'Willow Ln' WHEN 1 THEN N'Cedar St' WHEN 2 THEN N'Marigold Ave'
                             WHEN 3 THEN N'Front St'  ELSE N'Hillcrest Dr' END,
    CASE v.[Ordinal] % 3 WHEN 0 THEN N'Austin' WHEN 1 THEN N'Portland' ELSE N'Baltimore' END,
    CASE v.[Ordinal] % 3 WHEN 0 THEN N'TX'     WHEN 1 THEN N'OR'       ELSE N'MD'        END,
    CASE v.[Ordinal] % 3 WHEN 0 THEN N'78704'  WHEN 1 THEN N'97214'    ELSE N'21231'     END,
    CASE v.[Ordinal] % 5 WHEN 0 THEN N'Apartment' WHEN 1 THEN N'House' WHEN 2 THEN N'House'
                         WHEN 3 THEN N'Condo'     ELSE N'Townhouse' END,
    CASE WHEN v.[Ordinal] % 5 IN (1, 2) THEN 1 ELSE 0 END,          -- fenced yard mostly with houses
    CASE WHEN v.[Ordinal] % 4 = 0 THEN 1 ELSE 0 END,                -- has other pets
    CASE WHEN v.[Ordinal] % 7 = 0 THEN 1 ELSE 2 END,                -- adults
    CASE WHEN v.[Ordinal] % 3 = 0 THEN 0 WHEN v.[Ordinal] % 5 = 0 THEN 3 ELSE 1 END,  -- children
    CASE WHEN v.[Ordinal] % 3 = 0 THEN 1 ELSE 0 END,                -- foster approved: 20 of 60
    DATEADD(DAY, -((v.[Ordinal] * 17) % 700) - 20, CAST(GETDATE() AS DATE))
FROM (VALUES
    (1,N'Amelia',N'Hartley'),   (2,N'Ben',N'Castillo'),      (3,N'Carla',N'Whitmore'),   (4,N'Devon',N'Ashford'),
    (5,N'Elise',N'Draper'),     (6,N'Farid',N'Haddad'),      (7,N'Greta',N'Lindholm'),   (8,N'Hugo',N'Mercer'),
    (9,N'Imani',N'Boateng'),    (10,N'Jonah',N'Petrov'),     (11,N'Kira',N'Vasquez'),    (12,N'Leo',N'Bannister'),
    (13,N'Maya',N'Okonkwo'),    (14,N'Nils',N'Eriksen'),     (15,N'Opal',N'Sanderson'),  (16,N'Paolo',N'Ferrante'),
    (17,N'Quinn',N'Delacroix'), (18,N'Rosa',N'Alvarado'),    (19,N'Silas',N'Thornton'),  (20,N'Tessa',N'Nguyen'),
    (21,N'Umar',N'Chaudhry'),   (22,N'Vera',N'Kowalski'),    (23,N'Wade',N'Ellington'),  (24,N'Xenia',N'Popova'),
    (25,N'Yara',N'Solano'),     (26,N'Zane',N'Kirkpatrick'), (27,N'Adele',N'Fontaine'),  (28,N'Bruno',N'Salazar'),
    (29,N'Cassidy',N'Moreau'),  (30,N'Dimitri',N'Volkov'),   (31,N'Esme',N'Callahan'),   (32,N'Felix',N'Ortega'),
    (33,N'Gwen',N'Ashworth'),   (34,N'Hassan',N'Rahimi'),    (35,N'Iris',N'Beaumont'),   (36,N'Jasper',N'Vance'),
    (37,N'Kelsey',N'Donovan'),  (38,N'Lucas',N'Ferreira'),   (39,N'Mira',N'Sandoval'),   (40,N'Noel',N'Aubert'),
    (41,N'Odette',N'Marsh'),    (42,N'Pierce',N'Halloran'),  (43,N'Rania',N'Aziz'),      (44,N'Soren',N'Bjornson'),
    (45,N'Talia',N'Mendez'),    (46,N'Ulises',N'Cabrera'),   (47,N'Violet',N'Sinclair'), (48,N'Warren',N'Kessler'),
    (49,N'Xander',N'Wolfe'),    (50,N'Yvonne',N'Laurent'),   (51,N'Zara',N'Malik'),      (52,N'Aaron',N'Winslow'),
    (53,N'Bianca',N'Rossi'),    (54,N'Curtis',N'Underwood'), (55,N'Dahlia',N'Pham'),     (56,N'Emmett',N'Rourke'),
    (57,N'Fiona',N'Brennan'),   (58,N'Gideon',N'Slater'),    (59,N'Hana',N'Watanabe'),   (60,N'Ivan',N'Tarasov')
) v([Ordinal],[FirstName],[LastName]);
PRINT '  Loaded 60 adopters (20 of them foster approved)';
GO

-- ---- Dogs (120) ----
-- Names, sex, and color are literal so the records read like real dogs. Everything else is derived
-- from the ordinal, which keeps the data deterministic without writing 120 wide rows by hand.
DECLARE @Today DATE = CAST(GETDATE() AS DATE);

;WITH [DogSeed]([Ordinal],[Name],[Sex],[Color]) AS (
    SELECT * FROM (VALUES
        (1,N'Bella',N'Female',N'Black'),        (2,N'Charlie',N'Male',N'Golden'),      (3,N'Luna',N'Female',N'Gray'),
        (4,N'Cooper',N'Male',N'Chocolate'),     (5,N'Daisy',N'Female',N'Tricolor'),    (6,N'Max',N'Male',N'Sable'),
        (7,N'Sadie',N'Female',N'Brindle'),      (8,N'Rocky',N'Male',N'Fawn'),          (9,N'Molly',N'Female',N'Cream'),
        (10,N'Bear',N'Male',N'Black'),          (11,N'Lucy',N'Female',N'White'),       (12,N'Duke',N'Male',N'Brindle'),
        (13,N'Zoe',N'Female',N'Tan'),           (14,N'Tucker',N'Male',N'Red'),         (15,N'Ruby',N'Female',N'Red'),
        (16,N'Jack',N'Male',N'Black and White'),(17,N'Maggie',N'Female',N'Golden'),    (18,N'Oliver',N'Male',N'Merle'),
        (19,N'Sophie',N'Female',N'Spotted'),    (20,N'Buddy',N'Male',N'Tan'),          (21,N'Willow',N'Female',N'Gray'),
        (22,N'Finn',N'Male',N'Cream'),          (23,N'Nala',N'Female',N'Fawn'),        (24,N'Gus',N'Male',N'Brown'),
        (25,N'Penny',N'Female',N'Red'),         (26,N'Murphy',N'Male',N'Black'),       (27,N'Stella',N'Female',N'Merle'),
        (28,N'Bruno',N'Male',N'Brindle'),       (29,N'Hazel',N'Female',N'Tan'),        (30,N'Ollie',N'Male',N'White'),
        (31,N'Piper',N'Female',N'Tricolor'),    (32,N'Rex',N'Male',N'Black and Tan'),  (33,N'Coco',N'Female',N'Chocolate'),
        (34,N'Zeus',N'Male',N'Gray'),           (35,N'Lola',N'Female',N'Cream'),       (36,N'Diesel',N'Male',N'Blue'),
        (37,N'Roxy',N'Female',N'Brindle'),      (38,N'Toby',N'Male',N'Golden'),        (39,N'Millie',N'Female',N'White'),
        (40,N'Bandit',N'Male',N'Spotted'),      (41,N'Nova',N'Female',N'Black'),       (42,N'Hank',N'Male',N'Fawn'),
        (43,N'Ivy',N'Female',N'Merle'),         (44,N'Bruce',N'Male',N'Brown'),        (45,N'Juno',N'Female',N'Gray'),
        (46,N'Ranger',N'Male',N'Sable'),        (47,N'Poppy',N'Female',N'Cream'),      (48,N'Moose',N'Male',N'Black'),
        (49,N'Freya',N'Female',N'Red'),         (50,N'Cash',N'Male',N'Brindle'),       (51,N'Olive',N'Female',N'Tricolor'),
        (52,N'Scout',N'Male',N'Tan'),           (53,N'Winnie',N'Female',N'Golden'),    (54,N'Riley',N'Male',N'White'),
        (55,N'Pearl',N'Female',N'Cream'),       (56,N'Ace',N'Male',N'Black and White'),(57,N'Clover',N'Female',N'Spotted'),
        (58,N'Bo',N'Male',N'Chocolate'),        (59,N'Maple',N'Female',N'Red'),        (60,N'Ziggy',N'Male',N'Merle'),
        (61,N'Roxie',N'Female',N'Black'),       (62,N'Otis',N'Male',N'Gray'),          (63,N'Delilah',N'Female',N'Fawn'),
        (64,N'Boone',N'Male',N'Brindle'),       (65,N'Sage',N'Female',N'White'),       (66,N'Rufus',N'Male',N'Brown'),
        (67,N'Peaches',N'Female',N'Golden'),    (68,N'Chester',N'Male',N'Tan'),        (69,N'Marlow',N'Female',N'Gray'),
        (70,N'Kobe',N'Male',N'Black'),          (71,N'Trixie',N'Female',N'Tricolor'),  (72,N'Wyatt',N'Male',N'Cream'),
        (73,N'Belle',N'Female',N'Red'),         (74,N'Gunner',N'Male',N'Sable'),       (75,N'Harley',N'Female',N'Merle'),
        (76,N'Jasper',N'Male',N'Black and Tan'),(77,N'Athena',N'Female',N'White'),     (78,N'Milo',N'Male',N'Golden'),
        (79,N'Fern',N'Female',N'Brindle'),      (80,N'Rocco',N'Male',N'Chocolate'),    (81,N'Josie',N'Female',N'Spotted'),
        (82,N'Baxter',N'Male',N'Gray'),         (83,N'Nessa',N'Female',N'Black'),      (84,N'Teddy',N'Male',N'Fawn'),
        (85,N'Cleo',N'Female',N'Cream'),        (86,N'Sarge',N'Male',N'Brindle'),      (87,N'Birdie',N'Female',N'Tan'),
        (88,N'Loki',N'Male',N'Merle'),          (89,N'Wanda',N'Female',N'Red'),        (90,N'Copper',N'Male',N'Brown'),
        (91,N'Greta',N'Female',N'White'),       (92,N'Rooster',N'Male',N'Black and White'), (93,N'Fiona',N'Female',N'Golden'),
        (94,N'Bishop',N'Male',N'Gray'),         (95,N'Opal',N'Female',N'Tricolor'),    (96,N'Tank',N'Male',N'Fawn'),
        (97,N'Suki',N'Female',N'Black'),        (98,N'Arlo',N'Male',N'Cream'),         (99,N'Petunia',N'Female',N'Spotted'),
        (100,N'Boomer',N'Male',N'Brindle'),
        -- 101 through 112 become the litter born in shelter care (see the UPDATE below)
        (101,N'Dot',N'Female',N'Black'),        (102,N'Pippin',N'Male',N'Tan'),        (103,N'Wren',N'Female',N'Gray'),
        (104,N'Rowan',N'Male',N'Cream'),        (105,N'Tilly',N'Female',N'White'),     (106,N'Bramble',N'Male',N'Brown'),
        (107,N'Juniper',N'Female',N'Red'),      (108,N'Hopper',N'Male',N'Black and White'), (109,N'Marigold',N'Female',N'Golden'),
        (110,N'Nutmeg',N'Male',N'Chocolate'),   (111,N'Fig',N'Female',N'Fawn'),        (112,N'Alder',N'Male',N'Sable'),
        (113,N'Sunny',N'Female',N'Cream'),      (114,N'Django',N'Male',N'Black'),      (115,N'Ember',N'Female',N'Red'),
        (116,N'Waffles',N'Male',N'Golden'),     (117,N'Beatrix',N'Female',N'Tricolor'),(118,N'Chip',N'Male',N'Tan'),
        (119,N'Minnie',N'Female',N'White'),     (120,N'Zephyr',N'Male',N'Spotted')
    ) v([Ordinal],[Name],[Sex],[Color])
),
[B] AS (
    SELECT [ID],[Name],[SizeCategory],[EnergyLevel],[TypicalWeightLbsLow],[TypicalWeightLbsHigh],
           ROW_NUMBER() OVER (ORDER BY [Name]) AS [BreedNo]
    FROM [DogShelter].[Breed]
),
[S] AS (
    SELECT [ID], ROW_NUMBER() OVER (ORDER BY [Name]) AS [ShelterNo] FROM [DogShelter].[Shelter]
),
[Calc] AS (
    SELECT ds.[Ordinal], ds.[Name], ds.[Sex], ds.[Color],
        ((ds.[Ordinal] * 7) % 24) + 1                                       AS [PrimaryBreedNo],
        CASE WHEN ds.[Ordinal] % 3 = 0 THEN ((ds.[Ordinal] * 11) % 24) + 1 END AS [SecondaryBreedNo],
        ((ds.[Ordinal] * 5) % 3) + 1                                        AS [ShelterNo],
        DATEADD(DAY, -((ds.[Ordinal] * 13) % 540), @Today)                  AS [IntakeDate],
        CASE
            WHEN ds.[Ordinal] % 25 <= 10 THEN N'Adopted'
            WHEN ds.[Ordinal] % 25 <= 17 THEN N'Available'
            WHEN ds.[Ordinal] % 25 <= 19 THEN N'Pending'
            WHEN ds.[Ordinal] % 25 <= 21 THEN N'Fostered'
            WHEN ds.[Ordinal] % 25 =  22 THEN N'Medical Hold'
            WHEN ds.[Ordinal] % 25 =  23 THEN N'Intake'
            ELSE N'Transferred'
        END                                                                 AS [Status],
        CASE
            WHEN ds.[Ordinal] % 10 <= 3 THEN N'Stray'
            WHEN ds.[Ordinal] % 10 <= 6 THEN N'Owner Surrender'
            WHEN ds.[Ordinal] % 10 <= 8 THEN N'Transfer'
            ELSE N'Return'
        END                                                                 AS [IntakeType]
    FROM [DogSeed] ds
)
INSERT INTO [DogShelter].[Dog]
    ([Name],[ShelterID],[PrimaryBreedID],[SecondaryBreedID],[Sex],[EstimatedBirthDate],[WeightLbs],[Color],
     [MicrochipNumber],[IntakeDate],[IntakeType],[Status],[OutcomeDate],[IsSpayedNeutered],[IsHouseTrained],
     [GoodWithDogs],[GoodWithCats],[GoodWithKids],[AdoptionFee],[Bio])
SELECT
    c.[Name],
    s.[ID],
    pb.[ID],
    sb.[ID],
    c.[Sex],
    DATEADD(MONTH, -(((c.[Ordinal] * 3) % 110) + 4), c.[IntakeDate]),
    CAST(pb.[TypicalWeightLbsLow] +
         ((c.[Ordinal] * 7) % (pb.[TypicalWeightLbsHigh] - pb.[TypicalWeightLbsLow] + 1)) AS DECIMAL(6,2)),
    c.[Color],
    N'985' + RIGHT(N'000000000' + CAST(c.[Ordinal] * 7919 AS NVARCHAR(20)), 9),
    c.[IntakeDate],
    c.[IntakeType],
    c.[Status],
    CASE WHEN c.[Status] IN (N'Adopted', N'Transferred')
         THEN CASE WHEN DATEADD(DAY, ((c.[Ordinal] * 17) % 110) + 6, c.[IntakeDate]) > @Today
                   THEN @Today
                   ELSE DATEADD(DAY, ((c.[Ordinal] * 17) % 110) + 6, c.[IntakeDate]) END
    END,
    CASE WHEN c.[Ordinal] % 9 = 0 THEN 0 ELSE 1 END,
    CASE WHEN c.[Ordinal] % 3 = 0 THEN 0 ELSE 1 END,
    CASE WHEN c.[Ordinal] % 7 = 0 THEN NULL WHEN c.[Ordinal] % 5 = 0 THEN 0 ELSE 1 END,
    CASE WHEN c.[Ordinal] % 4 = 0 THEN NULL WHEN c.[Ordinal] % 3 = 0 THEN 0 ELSE 1 END,
    CASE WHEN c.[Ordinal] % 6 = 0 THEN NULL WHEN c.[Ordinal] % 8 = 0 THEN 0 ELSE 1 END,
    CAST(CASE pb.[SizeCategory] WHEN N'Toy' THEN 275 WHEN N'Small' THEN 250 WHEN N'Medium' THEN 195
                                WHEN N'Large' THEN 150 ELSE 125 END + (c.[Ordinal] % 3) * 10 AS DECIMAL(10,2)),
    CASE c.[Ordinal] % 6
        WHEN 0 THEN c.[Name] + N' is a ' + LOWER(pb.[SizeCategory]) + N' ' + pb.[Name] +
                    N' who greets every visitor at the kennel door. Staff describe them as steady and easy to handle.'
        WHEN 1 THEN N'Sweet and a little goofy, ' + c.[Name] + N' loves a tennis ball more than anything else in the world. ' +
                    N'Best suited to an adopter who can keep up with a ' + LOWER(pb.[EnergyLevel]) + N' energy dog.'
        WHEN 2 THEN c.[Name] + N' took a few days to come out of their shell and now leans into every scratch behind the ears. ' +
                    N'A calm home would suit them well.'
        WHEN 3 THEN N'Looking for a hiking partner? ' + c.[Name] + N' has stamina to spare and settles beautifully at the end of a long day.'
        WHEN 4 THEN c.[Name] + N' is a ' + pb.[Name] + N' with excellent house manners and a real talent for finding the sunniest spot in any room.'
        ELSE        N'Everyone at the shelter has a soft spot for ' + c.[Name] + N'. Gentle with staff, good on a leash, and ready for a home of their own.'
    END
FROM [Calc] c
    INNER JOIN [S] s  ON s.[ShelterNo]  = c.[ShelterNo]
    INNER JOIN [B] pb ON pb.[BreedNo]   = c.[PrimaryBreedNo]
    LEFT  JOIN [B] sb ON sb.[BreedNo]   = c.[SecondaryBreedNo] AND sb.[BreedNo] <> c.[PrimaryBreedNo];
PRINT '  Loaded 120 dogs';
GO

-- ---- The litter born in care: wire up the self-referencing MotherID ----
-- Willow is the mother. Her twelve puppies get IntakeType = 'Born In Care', an intake date three
-- weeks after hers, and a birth date equal to their intake date.
DECLARE @Today DATE = CAST(GETDATE() AS DATE);

UPDATE pup
SET [MotherID]           = mom.[ID],
    [IntakeType]         = N'Born In Care',
    [ShelterID]          = mom.[ShelterID],
    [IntakeDate]         = DATEADD(DAY, 21, mom.[IntakeDate]),
    [EstimatedBirthDate] = DATEADD(DAY, 21, mom.[IntakeDate]),
    [OutcomeDate]        = CASE WHEN pup.[OutcomeDate] IS NOT NULL
                                THEN CASE WHEN DATEADD(DAY, 66, mom.[IntakeDate]) > @Today
                                          THEN @Today
                                          ELSE DATEADD(DAY, 66, mom.[IntakeDate]) END
                           END
FROM [DogShelter].[Dog] pup
    CROSS JOIN (SELECT TOP 1 [ID],[ShelterID],[IntakeDate] FROM [DogShelter].[Dog] WHERE [Name] = N'Willow') mom
WHERE pup.[Name] IN (N'Dot', N'Pippin', N'Wren', N'Rowan', N'Tilly', N'Bramble',
                     N'Juniper', N'Hopper', N'Marigold', N'Nutmeg', N'Fig', N'Alder');
PRINT '  Wired 12 puppies to their mother via the self-referencing MotherID';
GO

-- ---- Adoption applications ----
DECLARE @Today DATE = CAST(GETDATE() AS DATE);

;WITH [D] AS (
    SELECT [ID],[Status],[IntakeDate],[OutcomeDate],[AdoptionFee],
           ROW_NUMBER() OVER (ORDER BY [IntakeDate], [Name]) AS [DN]
    FROM [DogShelter].[Dog]
),
[A] AS (SELECT [ID], ROW_NUMBER() OVER (ORDER BY [Email]) AS [AN] FROM [DogShelter].[Adopter]),
[C] AS (SELECT [ID], ROW_NUMBER() OVER (ORDER BY [Email]) AS [CN] FROM [DogShelter].[Staff] WHERE [Role] = N'Adoption Counselor'),
[Apps] AS (
    -- Every adopted dog has exactly one completed application, dated to match its outcome.
    SELECT d.[DN], d.[ID] AS [DogID], ((d.[DN] * 7) % 60) + 1 AS [AN], N'Completed' AS [Status],
           DATEADD(DAY, -14, d.[OutcomeDate]) AS [SubmittedOn], DATEADD(DAY, -7, d.[OutcomeDate]) AS [ReviewedOn],
           DATEADD(DAY, -5, d.[OutcomeDate]) AS [HomeVisitDate], d.[OutcomeDate] AS [AdoptionDate], d.[AdoptionFee] AS [FeePaid],
           N'Home visit went well. Adopter has prior experience with dogs of this size.' AS [DecisionNotes]
    FROM [D] d WHERE d.[Status] = N'Adopted'
    UNION ALL
    -- A competing application on every fourth adopted dog, denied because someone else got there first.
    SELECT d.[DN], d.[ID], ((d.[DN] * 23) % 60) + 1, N'Denied',
           DATEADD(DAY, -18, d.[OutcomeDate]), DATEADD(DAY, -9, d.[OutcomeDate]),
           NULL, NULL, NULL,
           N'Another approved application was already in progress for this dog.'
    FROM [D] d WHERE d.[Status] = N'Adopted' AND d.[DN] % 4 = 0
    UNION ALL
    -- Pending dogs are mid-review right now.
    SELECT d.[DN], d.[ID], ((d.[DN] * 7) % 60) + 1, N'Under Review',
           DATEADD(DAY, -10, @Today), NULL, DATEADD(DAY, 3, @Today), NULL, NULL,
           N'Application received. Home visit scheduled.'
    FROM [D] d WHERE d.[Status] = N'Pending'
    UNION ALL
    -- Some available dogs have open or closed applications that did not lead to adoption.
    SELECT d.[DN], d.[ID], ((d.[DN] * 13) % 60) + 1,
           CASE d.[DN] % 3 WHEN 0 THEN N'Submitted' WHEN 1 THEN N'Withdrawn' ELSE N'Denied' END,
           DATEADD(DAY, -((d.[DN] % 20) + 2), @Today),
           CASE WHEN d.[DN] % 3 <> 0 THEN DATEADD(DAY, -((d.[DN] % 20)), @Today) END,
           NULL, NULL, NULL,
           CASE d.[DN] % 3 WHEN 0 THEN NULL
                           WHEN 1 THEN N'Applicant withdrew after deciding on a lower-energy dog.'
                           ELSE N'Housing situation did not meet the fenced yard requirement for this dog.' END
    FROM [D] d WHERE d.[Status] = N'Available' AND d.[DN] % 3 = 0
)
INSERT INTO [DogShelter].[AdoptionApplication]
    ([DogID],[AdopterID],[SubmittedAt],[Status],[ReviewedByStaffID],[ReviewedAt],[HomeVisitDate],[DecisionNotes],[AdoptionDate],[FeePaid])
SELECT
    ap.[DogID],
    a.[ID],
    CAST(ap.[SubmittedOn] AS DATETIMEOFFSET),
    ap.[Status],
    c.[ID],
    CASE WHEN ap.[ReviewedOn] IS NOT NULL THEN CAST(ap.[ReviewedOn] AS DATETIMEOFFSET) END,
    ap.[HomeVisitDate],
    ap.[DecisionNotes],
    ap.[AdoptionDate],
    ap.[FeePaid]
FROM [Apps] ap
    INNER JOIN [A] a ON a.[AN] = ap.[AN]
    INNER JOIN [C] c ON c.[CN] = (ap.[DN] % (SELECT COUNT(*) FROM [C])) + 1;
PRINT '  Loaded adoption applications';
GO

-- ---- Foster placements ----
DECLARE @Today DATE = CAST(GETDATE() AS DATE);

;WITH [D] AS (
    SELECT [ID],[Status],[IntakeDate],
           ROW_NUMBER() OVER (ORDER BY [IntakeDate], [Name]) AS [DN]
    FROM [DogShelter].[Dog]
),
[F] AS (SELECT [ID], ROW_NUMBER() OVER (ORDER BY [Email]) AS [FN] FROM [DogShelter].[Adopter] WHERE [IsFosterApproved] = 1),
[Placements] AS (
    -- Dogs currently in foster care.
    SELECT d.[DN], d.[ID] AS [DogID], N'Active' AS [Status],
           DATEADD(DAY, -30, @Today) AS [StartDate], CAST(NULL AS DATE) AS [EndDate],
           N'Kennel stress - doing much better in a home environment' AS [Reason]
    FROM [D] d WHERE d.[Status] = N'Fostered'
    UNION ALL
    -- Historical placements that have since wrapped up.
    SELECT d.[DN], d.[ID],
           CASE WHEN d.[DN] % 21 = 0 THEN N'Ended Early' ELSE N'Completed' END,
           DATEADD(DAY, 10, d.[IntakeDate]),
           CASE WHEN DATEADD(DAY, 45, d.[IntakeDate]) > @Today THEN @Today ELSE DATEADD(DAY, 45, d.[IntakeDate]) END,
           CASE d.[DN] % 4 WHEN 0 THEN N'Post-surgery recovery'
                           WHEN 1 THEN N'Underweight on intake - needed a quiet place to put on condition'
                           WHEN 2 THEN N'Too young for the adoption floor'
                           ELSE N'Overcrowding at the shelter' END
    FROM [D] d WHERE d.[Status] <> N'Fostered' AND d.[DN] % 7 = 0
)
INSERT INTO [DogShelter].[FosterPlacement] ([DogID],[FosterAdopterID],[StartDate],[EndDate],[Status],[Reason],[Notes])
SELECT
    p.[DogID],
    f.[ID],
    p.[StartDate],
    p.[EndDate],
    p.[Status],
    p.[Reason],
    CASE WHEN p.[Status] = N'Ended Early'
         THEN N'Placement ended early - the foster household had a conflict with a resident pet.'
         ELSE N'Foster reports the dog settles quickly, sleeps through the night, and is clean in the house.' END
FROM [Placements] p
    INNER JOIN [F] f ON f.[FN] = (p.[DN] % (SELECT COUNT(*) FROM [F])) + 1;
PRINT '  Loaded foster placements';
GO

-- ---- Medical records (about three per dog) ----
DECLARE @Today DATE = CAST(GETDATE() AS DATE);

;WITH [D] AS (
    SELECT [ID],[IntakeDate],[OutcomeDate],
           ROW_NUMBER() OVER (ORDER BY [IntakeDate], [Name]) AS [DN]
    FROM [DogShelter].[Dog]
),
[V] AS (SELECT [ID], ROW_NUMBER() OVER (ORDER BY [Email]) AS [VN] FROM [DogShelter].[Staff] WHERE [Role] IN (N'Veterinarian', N'Vet Tech')),
[Recs] AS (
    SELECT d.[DN], d.[ID] AS [DogID], n.[K],
           CASE WHEN DATEADD(DAY, (n.[K] - 1) * 21, d.[IntakeDate]) > ISNULL(d.[OutcomeDate], @Today)
                THEN ISNULL(d.[OutcomeDate], @Today)
                ELSE DATEADD(DAY, (n.[K] - 1) * 21, d.[IntakeDate]) END AS [RecordDate],
           CASE (d.[DN] + n.[K]) % 6
               WHEN 0 THEN N'Vaccination' WHEN 1 THEN N'Exam'  WHEN 2 THEN N'Surgery'
               WHEN 3 THEN N'Treatment'   WHEN 4 THEN N'Test'  ELSE N'Dental' END AS [RecordType]
    FROM [D] d
        CROSS JOIN (VALUES (1),(2),(3),(4)) n([K])
    WHERE (d.[DN] + n.[K]) % 4 <> 0
)
INSERT INTO [DogShelter].[MedicalRecord] ([DogID],[RecordDate],[RecordType],[Description],[VeterinarianStaffID],[Cost],[FollowUpDate],[Notes])
SELECT
    r.[DogID],
    r.[RecordDate],
    r.[RecordType],
    CASE r.[RecordType]
        WHEN N'Vaccination' THEN CASE r.[DN] % 3 WHEN 0 THEN N'DHPP booster' WHEN 1 THEN N'Rabies vaccination (1 year)' ELSE N'Bordetella intranasal' END
        WHEN N'Exam'        THEN CASE r.[DN] % 2 WHEN 0 THEN N'Intake physical examination' ELSE N'Routine wellness examination' END
        WHEN N'Surgery'     THEN CASE r.[DN] % 2 WHEN 0 THEN N'Spay/neuter surgery' ELSE N'Mass removal, sent for histopathology' END
        WHEN N'Treatment'   THEN CASE r.[DN] % 3 WHEN 0 THEN N'Course of antibiotics for skin infection' WHEN 1 THEN N'Deworming and flea treatment' ELSE N'Ear infection treatment, both ears' END
        WHEN N'Test'        THEN CASE r.[DN] % 2 WHEN 0 THEN N'Heartworm antigen test' ELSE N'Fecal float and blood panel' END
        ELSE                     N'Dental cleaning with full-mouth radiographs'
    END,
    CASE WHEN (r.[DN] + r.[K]) % 9 = 0 THEN NULL ELSE v.[ID] END,
    CAST(CASE r.[RecordType]
             WHEN N'Vaccination' THEN 35  WHEN N'Exam'  THEN 65  WHEN N'Surgery' THEN 320
             WHEN N'Treatment'   THEN 95  WHEN N'Test'  THEN 120 ELSE 240 END
         + (r.[DN] % 5) * 5 AS DECIMAL(10,2)),
    CASE WHEN r.[RecordType] = N'Vaccination' THEN DATEADD(DAY, 365, r.[RecordDate])
         WHEN r.[RecordType] = N'Surgery'     THEN DATEADD(DAY, 14,  r.[RecordDate])
    END,
    CASE WHEN r.[RecordType] = N'Surgery' THEN N'Recovered without complication. Sutures checked at the follow-up.' END
FROM [Recs] r
    LEFT JOIN [V] v ON v.[VN] = (r.[DN] % (SELECT COUNT(*) FROM [V])) + 1;
PRINT '  Loaded medical records';
GO

-- ---- Dog traits (the pure junction) ----
;WITH [D] AS (
    SELECT [ID],[IntakeDate], ROW_NUMBER() OVER (ORDER BY [IntakeDate], [Name]) AS [DN] FROM [DogShelter].[Dog]
),
[T] AS (SELECT [ID], ROW_NUMBER() OVER (ORDER BY [Name]) AS [TN] FROM [DogShelter].[Trait]),
[ST] AS (SELECT [ID], ROW_NUMBER() OVER (ORDER BY [Email]) AS [SN] FROM [DogShelter].[Staff] WHERE [IsActive] = 1)
INSERT INTO [DogShelter].[DogTrait] ([DogID],[TraitID],[AssignedByStaffID],[AssignedAt],[Notes])
SELECT
    d.[ID],
    t.[ID],
    st.[ID],
    CAST(DATEADD(DAY, 3, d.[IntakeDate]) AS DATETIMEOFFSET),
    CASE WHEN (d.[DN] + t.[TN]) % 4 = 0 THEN N'Observed consistently during the first two weeks of care.' END
FROM [D] d
    INNER JOIN [T] t   ON (d.[DN] + t.[TN] * 3) % 5 = 0
    INNER JOIN [ST] st ON st.[SN] = ((d.[DN] + t.[TN]) % (SELECT COUNT(*) FROM [ST])) + 1;
PRINT '  Loaded dog trait tags';
GO

-- =============================================================================================================
-- PHASE 5: VERIFICATION
-- Run these to confirm the load worked, and to show the class what the data actually looks like
-- before a single line of application code exists.
-- =============================================================================================================
PRINT '=== Phase 5: Verification ===';
GO

SELECT N'Shelter' AS [Table], COUNT(*) AS [Rows] FROM [DogShelter].[Shelter]
UNION ALL SELECT N'Breed',               COUNT(*) FROM [DogShelter].[Breed]
UNION ALL SELECT N'Trait',               COUNT(*) FROM [DogShelter].[Trait]
UNION ALL SELECT N'Staff',               COUNT(*) FROM [DogShelter].[Staff]
UNION ALL SELECT N'Adopter',             COUNT(*) FROM [DogShelter].[Adopter]
UNION ALL SELECT N'Dog',                 COUNT(*) FROM [DogShelter].[Dog]
UNION ALL SELECT N'AdoptionApplication', COUNT(*) FROM [DogShelter].[AdoptionApplication]
UNION ALL SELECT N'FosterPlacement',     COUNT(*) FROM [DogShelter].[FosterPlacement]
UNION ALL SELECT N'MedicalRecord',       COUNT(*) FROM [DogShelter].[MedicalRecord]
UNION ALL SELECT N'DogTrait',            COUNT(*) FROM [DogShelter].[DogTrait];
GO

-- Dog population by status, per shelter
SELECT s.[Name] AS [Shelter], d.[Status], COUNT(*) AS [Dogs]
FROM [DogShelter].[Dog] d INNER JOIN [DogShelter].[Shelter] s ON s.[ID] = d.[ShelterID]
GROUP BY s.[Name], d.[Status]
ORDER BY s.[Name], d.[Status];
GO

-- The computed columns in action: longest-staying dogs still waiting for a home
SELECT TOP 10 d.[Name], b.[Name] AS [Breed], d.[Status], d.[IntakeDate], d.[DaysInCare], d.[EstimatedAgeMonths]
FROM [DogShelter].[Dog] d INNER JOIN [DogShelter].[Breed] b ON b.[ID] = d.[PrimaryBreedID]
WHERE d.[Status] = N'Available'
ORDER BY d.[DaysInCare] DESC;
GO

-- Both foreign keys to Breed resolving at once — the mixed-breed dogs
SELECT TOP 10 d.[Name], pb.[Name] AS [PrimaryBreed], sb.[Name] AS [SecondaryBreed]
FROM [DogShelter].[Dog] d
    INNER JOIN [DogShelter].[Breed] pb ON pb.[ID] = d.[PrimaryBreedID]
    INNER JOIN [DogShelter].[Breed] sb ON sb.[ID] = d.[SecondaryBreedID]
ORDER BY d.[Name];
GO

-- The self-referencing FKs: the litter born in care, and the staff reporting hierarchy
SELECT mom.[Name] AS [Mother], pup.[Name] AS [Puppy], pup.[Status], pup.[IntakeDate]
FROM [DogShelter].[Dog] pup INNER JOIN [DogShelter].[Dog] mom ON mom.[ID] = pup.[MotherID]
ORDER BY pup.[Name];
GO

SELECT st.[FullName] AS [StaffMember], st.[Role], ISNULL(sup.[FullName], N'(reports to no one)') AS [Supervisor]
FROM [DogShelter].[Staff] st LEFT JOIN [DogShelter].[Staff] sup ON sup.[ID] = st.[SupervisorID]
ORDER BY st.[ShelterID], st.[Role];
GO

PRINT '=== DogShelter demo schema is ready. Next stop: CodeGen. ===';
GO

