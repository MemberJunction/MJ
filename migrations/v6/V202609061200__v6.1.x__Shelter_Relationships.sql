/* ==============================================================================================
   MJ Academy — Harbor Street Animal Shelter: Entity Relationships

   Module 7. One migration, four sections, in dependency order:

     1. A correction to module 5's CareLog description (wrong MJ vocabulary — see below)
     2. Animal.IsGoodWithPeople          the attribute that belongs on the PARENT
     3. Dog and Cat                      IS-A subtypes, plus a backfill for existing animals
     4. Adopter and Adoption             the relationship that carries its own data

   WHY ONE FILE AND NOT FOUR. The three concepts are separate LESSONS, and it is tempting to give
   each its own migration to match. Two things say otherwise. Every earlier module in this course
   ships exactly one migration (module 3 created Animal AND Breed together), and more importantly a
   CodeGen run produces ONE capture tail: split the DDL across four files and that tail belongs to
   none of them. A migration is a unit of schema change, not a unit of teaching.

   ----------------------------------------------------------------------------------------------
   THE THREE RELATIONSHIP SHAPES THIS MIGRATION CREATES, AND HOW TO TELL THEM APART

   MemberJunction reserves three words, and states the rule in packages/MJCore/docs/embedded-records.md:

       "The word CHILD means IS-A subtype and nothing else. FK dependents that point at you are
        RELATED RECORDS. A peer you point at is an EMBEDDED RECORD."

     IS-A                        shared primary key. One logical record across two tables.  Dog, Cat
     Related-record collection   many rows, each with an FK pointing UP at the parent.      CareLog, Adoption
     Embedded record             a 1:1 peer whose FK sits on the OWNER (MJ: Deal.OrderID).  none here

   The question that sorts them is mechanical rather than a judgement call: WHERE DOES THE FOREIGN
   KEY LIVE, AND IS THE PRIMARY KEY SHARED?

   The shelter has no embedded record, and module 7 says so rather than inventing one.
   ----------------------------------------------------------------------------------------------

   No CreatedAt, UpdatedAt or audit columns are declared anywhere below: MJ records field-level
   history in RecordChange for any entity with TrackRecordChanges enabled, which is the default.
   ============================================================================================== */


/* ==============================================================================================
   SECTION 1 — Correct module 5's CareLog description

   Module 5 described CareLog as being "converted to an embedded record in module 7". That is the
   wrong term: an embedded record is a 1:1 peer whose FK sits on the owner. CareLog is many rows
   pointing UP at their parent, which MJ calls a related-record collection.

   Worth correcting rather than shrugging at, because this is not a code comment. CodeGen copies
   extended properties into __mj.Entity.Description, which is what Explorer shows, what a developer
   reads to understand the model, and what module 8's agent is handed as context.

   Module 5's own migration is NOT edited: it is already applied, and changing an applied migration
   breaks its checksum and every environment that ran it. A correction gets a new migration. That is
   the ordinary way to fix anything that has shipped.
   ============================================================================================== */

EXEC sp_updateextendedproperty
    @name = N'MS_Description',
    @value = N'An event log of care given to an animal: one row per thing that was done, on a date. Introduced in MJ Academy module 5 as a plain foreign-key table, then declared in module 7 as a RELATED-RECORD COLLECTION on the Animals-to-Care-Logs relationship -- so an animal and its care logs load, validate and save as one unit. Not an "embedded record": in MemberJunction that term means a 1:1 peer whose foreign key sits on the owner, which is the opposite arrangement.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CareLog';
GO


/* ==============================================================================================
   SECTION 2 — Animal.IsGoodWithPeople

   Added BEFORE the subtypes, because deciding where it goes is half the IS-A lesson.

   "Is this animal good with people?" is asked of every animal, dog and cat alike. An attribute
   IDENTICAL on every subtype belongs on the PARENT. Put it on Dog and Cat instead and you get two
   columns, two constraints, two generated fields, and every query that wants it has to know which
   subtype it is reading.

   Contrast section 3. Leash training is meaningless for a cat; litter training is meaningless for a
   dog. THOSE belong on the subtype, and the fact that they are nonsense on the other side is what
   proves the split is real rather than decorative.

   So the test is not "does this describe a dog?" but "would this column be NULL for an entire
   subtype, forever, by definition?"

   NULLABLE ON PURPOSE. NULL means "not assessed yet", a genuinely different fact from "no, this
   animal is not good with people". An animal is logged at intake and evaluated later, often by a
   volunteer days afterwards. BIT NOT NULL DEFAULT 0 would assert that every animal is bad with
   people from the moment it is entered — false, and for an adoption listing, harmful.

   TWO COLUMNS, BOTH ON THE PARENT. Notes joins IsGoodWithPeople here, and the pairing is the point:
   staff take notes on every animal identically, so it belongs on Animal for exactly the same reason.
   It is NOT a duplicate of Description -- Description is the outward-facing blurb an adopter reads,
   Notes is the internal remark ("bolts the door if you leave it ajar"). Same free-text shape, two
   different audiences, and conflating them is how a listing ends up quoting a staff aside.
   ============================================================================================== */

ALTER TABLE ${flyway:defaultSchema}.Animal
    ADD IsGoodWithPeople BIT NULL,
        Notes NVARCHAR(MAX) NULL;
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether this animal is comfortable around people. Lives on Animal rather than on the Dog and Cat subtypes because it is asked of every animal identically -- an attribute shared by all subtypes belongs on the parent. NULL means not yet assessed, which is deliberately distinct from a recorded No: an animal is logged at intake and evaluated later.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Animal',
    @level2type = N'COLUMN', @level2name = N'IsGoodWithPeople';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Internal staff notes about this animal -- the escape hatch for the odd descriptive thing that has no column of its own. Distinct from Description, which is the outward-facing blurb an adopter reads: Notes is where "bolts the door if you leave it ajar" or "only eats the pate food" goes. Lives on Animal rather than on the Dog and Cat subtypes for exactly the same reason IsGoodWithPeople does -- staff take notes on every animal identically, so an attribute shared by all subtypes belongs on the parent.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Animal',
    @level2type = N'COLUMN', @level2name = N'Notes';
GO


/* ==============================================================================================
   SECTION 3 — Dog and Cat, the IS-A subtypes

   THE SHAPE THAT MAKES IT IS-A: THE PRIMARY KEY IS THE RELATIONSHIP

   Look at what these tables do NOT have. There is no DogID. There is no AnimalID column. There is
   one column called ID, and it is simultaneously:

       the PRIMARY KEY of Dog        (CONSTRAINT PK_Dog PRIMARY KEY (ID))
       a FOREIGN KEY to Animal.ID    (CONSTRAINT FK_Dog_Animal FOREIGN KEY (ID) REFERENCES Animal)

   That single shared value IS the relationship. A dog row and its animal row are two halves of one
   logical record, not two records referencing each other. Contrast CareLog, which has its own
   independent ID plus a separate AnimalID pointing up — a related record, a different thing.

   Because the key is shared there is no "attach" step and no join column to populate. You create a
   Dog, set both its own fields and Animal's fields on the same object, and Save() once. MJ routes
   each field to the table that owns it and writes Animal first, then Dog, in one transaction. You
   never assign the ID yourself.

   FIELD-NAME COLLISIONS ARE A HARD ERROR. A subtype must not declare a column whose name already
   exists on the parent chain — CodeGen logs a hard error and skips the entity; it does not merge,
   shadow or rename. So Dog cannot have Name, Species, Status, Description or PhotoBase64; those come
   from Animal and are readable straight off a Dog (dog.Name works, and returns Animal's value).

   That is also why a dog's IsHouseTrained and a cat's IsLitterTrained are named differently rather
   than sharing one column. Sibling subtypes MAY share a name — they collide only with the parent —
   but naming two different behaviours the same thing would be worse than a collision.

   THE BACKFILL, AND WHY IT IS SQL RATHER THAN APP CODE

   Modules 3 through 6 created animals with no subtype row, so every existing animal needs one. That
   is done here in SQL because of a genuine constraint of IS-A, not for convenience: MJ's save path
   does not model attaching a subtype to a parent row that already exists. NewRecord() starts a NEW
   chain with a fresh shared key, so "dog.NewRecord(); dog.Set('ID', existingAnimalId)" creates a
   second animal and then fights the first over the primary key. The IS-A guide names this as an
   anti-pattern explicitly.

   Going forward the app creates a Dog or a Cat from the start, which is also how a shelter works:
   whether the animal in the carrier is a dog or a cat is the one thing known for certain at intake.
   Animal.Species has carried that answer since module 3; it is the discriminator, and the backfill
   uses it to decide which subtype table each existing animal lands in.

   Temperament is left NULL by the backfill on purpose. Inventing values would put fabricated
   adoption-relevant claims — "leash trained", "good with cats" — into the demo data, and those are
   exactly the fields a real shelter must not guess at.
   ============================================================================================== */

CREATE TABLE ${flyway:defaultSchema}.Dog (
    ID UNIQUEIDENTIFIER NOT NULL,
    EnergyLevel NVARCHAR(20) NULL,
    IsLeashTrained BIT NULL,
    IsHouseTrained BIT NULL,
    IsGoodWithDogs BIT NULL,
    CONSTRAINT PK_Dog PRIMARY KEY (ID),
    CONSTRAINT FK_Dog_Animal FOREIGN KEY (ID) REFERENCES ${flyway:defaultSchema}.Animal (ID),
    CONSTRAINT CK_Dog_EnergyLevel CHECK (EnergyLevel IS NULL OR EnergyLevel IN ('Low','Moderate','High','Very High'))
);
GO

CREATE TABLE ${flyway:defaultSchema}.Cat (
    ID UNIQUEIDENTIFIER NOT NULL,
    IsIndoorOnly BIT NULL,
    IsDeclawed BIT NULL,
    IsLitterTrained BIT NULL,
    IsGoodWithCats BIT NULL,
    CONSTRAINT PK_Cat PRIMARY KEY (ID),
    CONSTRAINT FK_Cat_Animal FOREIGN KEY (ID) REFERENCES ${flyway:defaultSchema}.Animal (ID)
);
GO

/* ---------------------------------------------------------------------------------------------
   Table and column descriptions. These become the MJ entity and field descriptions, so they are
   what a developer -- and an agent in module 8 -- reads to understand the model.
   --------------------------------------------------------------------------------------------- */

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The dog-specific half of an Animal. An IS-A subtype: its ID column is both its primary key and a foreign key to Animal.ID, so a Dog row and its Animal row share one key and form one logical record. Holds only what is meaningless for a cat -- leash training, house training, energy level, dog-to-dog tolerance. Attributes shared by every species live on Animal instead.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Dog';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'How much exercise this dog needs: Low, Moderate, High or Very High. Shelters assess and advertise this for dogs because it is the single biggest predictor of a returned adoption. NULL means not yet assessed.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Dog',
    @level2type = N'COLUMN', @level2name = N'EnergyLevel';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether this dog walks acceptably on a leash. Dog-only: a cat is never leash trained in any sense the shelter tracks, which is why the column is here and not on Animal. NULL means not yet assessed.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Dog',
    @level2type = N'COLUMN', @level2name = N'IsLeashTrained';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether this dog is reliably house trained. Named IsHouseTrained rather than sharing a column with the cat equivalent because the two mean different things -- a cat uses a litter box, tracked separately as Cat.IsLitterTrained. NULL means not yet assessed.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Dog',
    @level2type = N'COLUMN', @level2name = N'IsHouseTrained';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether this dog tolerates other dogs. Drives kennel pairing and playgroup decisions. NULL means not yet assessed.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Dog',
    @level2type = N'COLUMN', @level2name = N'IsGoodWithDogs';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The cat-specific half of an Animal. An IS-A subtype: its ID column is both its primary key and a foreign key to Animal.ID, so a Cat row and its Animal row share one key and form one logical record. Holds only what is meaningless for a dog -- litter training, declaw history, indoor-only placement, cat-to-cat tolerance.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Cat';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether this cat must be placed in an indoor-only home. A placement condition specific to cats, commonly required for declawed or FIV-positive animals. NULL means not yet assessed.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Cat',
    @level2type = N'COLUMN', @level2name = N'IsIndoorOnly';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether this cat has been declawed. Recorded because it is adoption-relevant -- a declawed cat generally cannot be placed outdoors -- and because it is surgical history the shelter did not perform and must not lose. NULL means not known.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Cat',
    @level2type = N'COLUMN', @level2name = N'IsDeclawed';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether this cat reliably uses a litter box. The cat equivalent of Dog.IsHouseTrained, deliberately given its own name because the two are different behaviours. NULL means not yet assessed.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Cat',
    @level2type = N'COLUMN', @level2name = N'IsLitterTrained';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether this cat tolerates other cats. Decides whether it can share a condo and whether it can go to a multi-cat home. NULL means not yet assessed.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Cat',
    @level2type = N'COLUMN', @level2name = N'IsGoodWithCats';
GO

/* ---------------------------------------------------------------------------------------------
   NO BACKFILL HERE, AND THAT IS DELIBERATE (ruled 8 Sep 2026).

   An earlier draft of this migration inserted a Dog or Cat row for every animal that already
   existed, derived from Animal.Species. It was removed, for two reasons worth understanding.

   FIRST: it made the migration ORDER-DEPENDENT. Run it after modules 3-6 have created animals and
   every animal gets a subtype row; run the same migrations against a database built from zero and
   seeded afterwards and it fires against an EMPTY Animal table and silently does nothing. Same
   migrations, two different databases. Migrations do schema; the seed script does data. Mixing them
   is what produced that split.

   SECOND: it is not needed. A subtype is OPTIONAL by design -- an animal is a valid record before
   anyone has assessed its temperament -- so nothing is broken by an animal that has no Dog or Cat
   row. It was a convenience, not a correctness requirement.

   WHAT THIS MEANS GOING FORWARD, WHICH IS ALSO THE LESSON. From module 7 on, an animal is created
   AS a Dog or a Cat -- one save, its own fields and Animal's together -- because species is the one
   thing known for certain at intake. Animals that predate the subtypes simply do not have one, which
   is exactly what a real shelter's historical records look like.

   ON THIS VERSION OF MJ they cannot be retrofitted through the app either, which is worth knowing
   before you try. Verified against this API rather than assumed: `CreateMJDog` with only an existing
   ID starts a NEW chain, so the parent insert arrives empty ("Failed to save parent entity
   'MJ: Animals': Name cannot be null"), and supplying the parent's fields too collides on PK_Animal.
   The IS-A guide on this pin names it as an anti-pattern.

   That is a statement about v6.1.0-edge.4, NOT about MemberJunction. MJ #3825 ("IS-A promotion --
   attach a NEW child to an EXISTING parent") added a promotion path, and BaseEntity.EnsureISAChild()
   now does exactly this job -- bizapps-orders uses it so a Product form can mount its EventProduct
   fields on a product that already exists. It landed after our pin. When this course moves to the
   LTS release, promotion becomes available and the create-as-subtype path below still works
   unchanged, so nothing here has to be rewritten.
   --------------------------------------------------------------------------------------------- */

/* ==============================================================================================
   SECTION 4 — Adopter and Adoption, the relationship that carries its own data

   WHY Adoption IS ITS OWN ENTITY AND NOT A COLUMN ON EITHER SIDE

   The tempting shortcut is Animal.AdoptedByAdopterID. It is wrong three times over:

     1. One animal accumulates SEVERAL inquiries over its stay — three families ask about the same
        dog, two are screened, one completes. A column holds one value and loses the other two.
     2. An adopter inquires about SEVERAL animals. Same problem from the other side.
     3. The interesting facts — when they asked, what fee was agreed, why they were turned down —
        describe NEITHER the animal NOR the person. They describe the transaction between them.

   That third point is the one to remember. Fee is not a property of a cat. DenialReason is not a
   property of a family.

   HOW THIS DIFFERS FROM THE OTHER TWO SHAPES IN THIS MIGRATION

     Dog IS-A Animal          shared primary key, one logical record split across two tables
     Animal has CareLogs      a collection the animal OWNS — delete the animal, the logs go too
     Animal <-> Adoption      neither side owns it; meaningful from both directions

   Adoption is reachable as a collection from BOTH Animal and Adopter, which is exactly why it is not
   an owned record: ownership belongs to one side, and here it belongs to neither. Hence OnRemove
   'refuse' in the metadata, not 'delete' — deleting an adopter must never silently erase the history
   of animals they adopted.

   THE STATUS FUNNEL

        Inquiry -> Screening -> Approved -> Completed
           |          |            |
           +----------+------------+---> Withdrawn | Denied | Cancelled

   The happy path is a forward-only ladder. The three exits are reachable from ANY open state,
   because a real adoption can collapse at any point — the family stops answering, a reference fails,
   the animal turns out to be unsuitable for their home.

     Withdrawn   the ADOPTER pulled out. Kept distinct from Denied so a withdrawal never reads as a
                 rejection on a family's record.
     Denied      the SHELTER refused. Requires a DenialReason — see the check constraint.
     Cancelled   it fell through for some other reason: the animal was returned to its owner, a
                 medical hold was placed, the adopter became unreachable.

   Completing an adoption is what flips the animal to Adopted — and module 6 already built the method
   that does it correctly (MarkAdopted, which sets Status AND clears HousingID together, so the
   departure and the freed kennel cannot drift apart). Module 7 calls it; it does not reimplement it.

   WHAT THE DATABASE ENFORCES, AND WHAT IT CANNOT

   Two rules ARE expressible as check constraints, so they are check constraints — a rule the
   database holds is a rule no code path can route around:

       Completed must carry a CompletedDate.
       Denied must carry a DenialReason.

   The rest cannot be, and that is module 6's dividing line in a new place. "The animal must be
   Available before an adoption completes" reads a column on ANOTHER row. "This adopter must be
   approved" reads a third. "No two open inquiries from the same family for the same animal" is a
   filtered aggregate over this table. All three land in entity validation.
   ============================================================================================== */

CREATE TABLE ${flyway:defaultSchema}.Adopter (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    FirstName NVARCHAR(50) NOT NULL,
    LastName NVARCHAR(50) NOT NULL,
    Email NVARCHAR(255) NOT NULL,
    HousingType NVARCHAR(20) NULL,
    HasYard BIT NULL,
    HasOtherPets BIT NULL,
    IsApproved BIT NOT NULL DEFAULT 0,
    IsActive BIT NOT NULL DEFAULT 1,
    -- WHY THIS COLUMN EXISTS: MemberJunction sets IsNameField only on a field literally called Name,
    -- and an entity with no name field cannot resolve a display column for foreign keys pointing at
    -- it on the first metadata pass. That deferred Adoption's virtual display fields to a later pass
    -- -- and because an entity's display fields are created as a SET, the Animal one was deferred
    -- with it even though Animal always had a Name. Three CodeGen passes instead of two, and a clean
    -- deploy that finished with work outstanding. This column collapses it back to two.
    --
    -- MEASURED LIMIT, so nobody expects more: vwAdoptions still joins
    -- `MJAdopter_AdopterID.[FirstName] AS [Adopter]`, NOT this column -- a computed column is
    -- IsVirtual=1 to MJ and is not chosen as a display column, so an adoption grid shows "Ada", not
    -- "Ada Okafor". Ruled acceptable (Marcelo, 8 Sep 2026); it earns its place on the pass fix alone.
    --
    -- POSITION IS REQUIRED. MemberJunction classifies a computed column as VIRTUAL
    -- (IsVirtual=1, IsComputed=1 -- physical storage, read-only in SQL), and it expects every base
    -- column to sequence BEFORE any virtual one so that EntityField order matches the base view's
    -- `[base].*` then joins. Declared 4th, this column put Email and everything after it behind a
    -- virtual field and CodeGen raised an integrity warning: saves stay correct because the
    -- save-capture re-orders defensively, but the metadata is wrong. Declared last, the invariant
    -- holds. Computed columns go at the end of the table.
    Name AS (FirstName + ' ' + LastName) PERSISTED,
    CONSTRAINT PK_Adopter PRIMARY KEY (ID),
    CONSTRAINT UQ_Adopter_Email UNIQUE (Email),
    CONSTRAINT CK_Adopter_HousingType CHECK (HousingType IS NULL OR HousingType IN ('House','Apartment','Condo','Farm','Other'))
);
GO

CREATE TABLE ${flyway:defaultSchema}.Adoption (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    AnimalID UNIQUEIDENTIFIER NOT NULL,
    AdopterID UNIQUEIDENTIFIER NOT NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Inquiry',
    InquiryDate DATE NOT NULL,
    CompletedDate DATE NULL,
    Fee DECIMAL(18,2) NULL,
    DenialReason NVARCHAR(500) NULL,
    Notes NVARCHAR(MAX) NULL,
    CONSTRAINT PK_Adoption PRIMARY KEY (ID),
    CONSTRAINT FK_Adoption_AnimalID FOREIGN KEY (AnimalID) REFERENCES ${flyway:defaultSchema}.Animal (ID),
    CONSTRAINT FK_Adoption_AdopterID FOREIGN KEY (AdopterID) REFERENCES ${flyway:defaultSchema}.Adopter (ID),
    CONSTRAINT CK_Adoption_Status CHECK (Status IN ('Inquiry','Screening','Approved','Completed','Withdrawn','Denied','Cancelled')),
    CONSTRAINT CK_Adoption_CompletedDate_Order CHECK (CompletedDate IS NULL OR CompletedDate >= InquiryDate),
    CONSTRAINT CK_Adoption_Completed_Requires_Date CHECK (Status <> 'Completed' OR CompletedDate IS NOT NULL),
    CONSTRAINT CK_Adoption_Denied_Requires_Reason CHECK (Status <> 'Denied' OR DenialReason IS NOT NULL),
    CONSTRAINT CK_Adoption_Fee CHECK (Fee IS NULL OR Fee >= 0)
);
GO

/* ---------------------------------------------------------------------------------------------
   Adopter descriptions
   --------------------------------------------------------------------------------------------- */

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A person or household applying to adopt. A related record with its own list and form: an adopter is meaningful on their own, exists before any particular adoption, and outlives every one of them. Never deleted while adoptions reference them -- history has to survive the person moving away, which is why Adoption declares OnRemove refuse rather than delete.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Adopter';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The adopter''s given name.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Adopter',
    @level2type = N'COLUMN', @level2name = N'FirstName';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The adopter''s family name.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Adopter',
    @level2type = N'COLUMN', @level2name = N'LastName';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The adopter''s full display name, computed from FirstName + LastName and PERSISTED. It exists because MemberJunction needs a NAME FIELD: CodeGen marks a field as the entity''s name field only when it is literally called Name, and an entity without one cannot resolve display columns for foreign keys pointing at it on its FIRST metadata pass -- which turned a two-pass CodeGen into a three-pass one and left a clean deploy with metadata work outstanding. Measured limit: base views still join FirstName for the adopter display rather than this column, because a computed column is virtual to MJ and is not selected for that role. Computed rather than stored so it cannot drift from its parts, and PERSISTED so it can be indexed and read like any other column. MJ''s CRUD procedures exclude computed columns, so nothing attempts to write it.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Adopter',
    @level2type = N'COLUMN', @level2name = N'Name';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Contact email, and the practical identity of an adopter -- unique, because two records for the same family split their history and hide a prior denial.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Adopter',
    @level2type = N'COLUMN', @level2name = N'Email';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'What kind of home this is: House, Apartment, Condo, Farm or Other. One of the three matching signals a shelter actually screens on, alongside HasYard and HasOtherPets. NULL means not yet collected.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Adopter',
    @level2type = N'COLUMN', @level2name = N'HousingType';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether the home has an enclosed yard. Matters most for the high-energy dogs Dog.EnergyLevel identifies. NULL means not yet collected.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Adopter',
    @level2type = N'COLUMN', @level2name = N'HasYard';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether there are already animals in the home. Pairs with Dog.IsGoodWithDogs and Cat.IsGoodWithCats to decide whether a placement is plausible. NULL means not yet collected.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Adopter',
    @level2type = N'COLUMN', @level2name = N'HasOtherPets';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether this adopter has passed screening. A property of the PERSON, not of any one adoption, so it is recorded once and reused across every inquiry they make -- which is the whole reason Adopter is a separate entity rather than fields repeated on Adoption.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Adopter',
    @level2type = N'COLUMN', @level2name = N'IsApproved';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Soft retirement. An adopter who has moved away or asked to be removed is deactivated rather than deleted, because their completed adoptions are permanent history.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Adopter',
    @level2type = N'COLUMN', @level2name = N'IsActive';
GO

/* ---------------------------------------------------------------------------------------------
   Adoption descriptions
   --------------------------------------------------------------------------------------------- */

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'One family''s pursuit of one animal, from first enquiry to outcome. The whole funnel, not just the successful end of it -- which is how the question "is anyone interested in this dog?" gets answered. Meaningful from both sides, so neither Animal nor Adopter owns it; it carries the facts that describe the transaction itself rather than either party.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Adoption';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The animal being enquired about.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Adoption',
    @level2type = N'COLUMN', @level2name = N'AnimalID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The family making the enquiry.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Adoption',
    @level2type = N'COLUMN', @level2name = N'AdopterID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Where this adoption stands. Inquiry, Screening, Approved and Completed are a forward-only ladder; Withdrawn (the adopter pulled out), Denied (the shelter refused) and Cancelled (it fell through for some other reason) are exits reachable from any non-terminal state, because an adoption can collapse at any point. Completing one is what flips the animal to Adopted.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Adoption',
    @level2type = N'COLUMN', @level2name = N'Status';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When the family first asked about this animal. Set at creation and never moved, so the time an adoption took can always be measured.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Adoption',
    @level2type = N'COLUMN', @level2name = N'InquiryDate';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When the adoption completed. Required whenever Status is Completed and enforced by a check constraint, because a completed adoption with no date is unusable in every report that matters.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Adoption',
    @level2type = N'COLUMN', @level2name = N'CompletedDate';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The adoption fee agreed for this placement. Lives here rather than on Animal or Adopter because it describes the transaction: the same animal can be waived a fee for one family and not another.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Adoption',
    @level2type = N'COLUMN', @level2name = N'Fee';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Why the shelter refused. Required whenever Status is Denied and enforced by a check constraint: a rejection with no recorded reason cannot be explained to the applicant later and cannot be reviewed for fairness.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Adoption',
    @level2type = N'COLUMN', @level2name = N'DenialReason';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Free-text detail about this particular enquiry -- home visit observations, scheduling, what the family is looking for.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Adoption',
    @level2type = N'COLUMN', @level2name = N'Notes';
GO



























































/* ============================================================================================
   ============================================================================================
   ==                                                                                        ==
   ==   EVERYTHING BELOW THIS POINT IS PRODUCED BY THE MEMBERJUNCTION CodeGen TOOL           ==
   ==                                                                                        ==
   ==   DO NOT EDIT ANY OF IT BY HAND.                                                       ==
   ==                                                                                        ==
   ==   Run `pnpm run mj:codegen` and append its output here. On a CLEAN database ONE run     ==
   ==   does the whole IS-A job: it creates the four entities, sets Entity.ParentID from      ==
   ==   config/database-metadata-config.json, and materialises the inherited virtual fields   ==
   ==   plus the parent JOINs in vwDogs / vwCats.                                             ==
   ==                                                                                        ==
   ==   The tail is built by REPLAY, not by trusting one capture: fold it in, wipe, migrate,  ==
   ==   sync, and re-run CodeGen until it produces NOTHING. See the module 7 action log.      ==
   ==                                                                                        ==
   ============================================================================================
   ============================================================================================ */

/* ============================================================================================
   ============================================================================================
   ==                                                                                        ==
   ==   EVERYTHING BELOW THIS POINT IS PRODUCED BY THE MEMBERJUNCTION CodeGen TOOL           ==
   ==                                                                                        ==
   ==   DO NOT EDIT ANY OF IT BY HAND.                                                       ==
   ==                                                                                        ==
   ==   Built by the runbook in the module 7 action log:                                      ==
   ==     wipe -> migrate -> codegen -> sync push -> codegen                                  ==
   ==   and the tail is those TWO codegen captures. Nothing should be left for a third run.    ==
   ==                                                                                        ==
   ============================================================================================
   ============================================================================================ */

/* ---------------------------------------------------------------------------------------------
   CAPTURE 1 of 2 -- `pnpm run mj:codegen` against the freshly-migrated database.
   Creates the four entities with all their fields, base views, CRUD procs, permissions and
   application registrations; sets Entity.ParentID for Dogs/Cats and materialises their inherited
   IS-A virtual fields; and creates the Adoption display fields (Animal, Adopter) -- which it can
   only do in this pass because Adopter now HAS a name field. See section 4's note.
   --------------------------------------------------------------------------------------------- */

/* SQL generated to create new entity MJ: Dogs */

      INSERT INTO [${flyway:defaultSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         '64b7852d-9cef-40c7-890c-0b3dbd7eed1a',
         'MJ: Dogs',
         'Dogs',
         'The dog-specific half of an Animal. An IS-A subtype: its ID column is both its primary key and a foreign key to Animal.ID, so a Dog row and its Animal row share one key and form one logical record. Holds only what is meaningless for a cat -- leash training, house training, energy level, dog-to-dog tolerance. Attributes shared by every species live on Animal instead.',
         NULL,
         'Dog',
         'vwDogs',
         '${flyway:defaultSchema}',
         1,
         1,
         1
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ: Dogs to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '64b7852d-9cef-40c7-890c-0b3dbd7eed1a', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Dogs for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('64b7852d-9cef-40c7-890c-0b3dbd7eed1a', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Dogs for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('64b7852d-9cef-40c7-890c-0b3dbd7eed1a', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Dogs for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('64b7852d-9cef-40c7-890c-0b3dbd7eed1a', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ: Cats */

      INSERT INTO [${flyway:defaultSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         'b7b001cb-8219-4cf9-b507-ff85d99a9f77',
         'MJ: Cats',
         'Cats',
         'The cat-specific half of an Animal. An IS-A subtype: its ID column is both its primary key and a foreign key to Animal.ID, so a Cat row and its Animal row share one key and form one logical record. Holds only what is meaningless for a dog -- litter training, declaw history, indoor-only placement, cat-to-cat tolerance.',
         NULL,
         'Cat',
         'vwCats',
         '${flyway:defaultSchema}',
         1,
         1,
         1
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ: Cats to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'b7b001cb-8219-4cf9-b507-ff85d99a9f77', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Cats for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('b7b001cb-8219-4cf9-b507-ff85d99a9f77', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Cats for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('b7b001cb-8219-4cf9-b507-ff85d99a9f77', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Cats for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('b7b001cb-8219-4cf9-b507-ff85d99a9f77', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ: Adopters */

      INSERT INTO [${flyway:defaultSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         '279f206b-822b-41ba-97b6-3bc705db55ab',
         'MJ: Adopters',
         'Adopters',
         'A person or household applying to adopt. A related record with its own list and form: an adopter is meaningful on their own, exists before any particular adoption, and outlives every one of them. Never deleted while adoptions reference them -- history has to survive the person moving away, which is why Adoption declares OnRemove refuse rather than delete.',
         NULL,
         'Adopter',
         'vwAdopters',
         '${flyway:defaultSchema}',
         1,
         1,
         1
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ: Adopters to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '279f206b-822b-41ba-97b6-3bc705db55ab', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Adopters for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('279f206b-822b-41ba-97b6-3bc705db55ab', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Adopters for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('279f206b-822b-41ba-97b6-3bc705db55ab', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Adopters for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('279f206b-822b-41ba-97b6-3bc705db55ab', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ: Adoptions */

      INSERT INTO [${flyway:defaultSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         'a2425230-0f81-413b-b391-98d246e04020',
         'MJ: Adoptions',
         'Adoptions',
         'One family''s pursuit of one animal, from first enquiry to outcome. The whole funnel, not just the successful end of it -- which is how the question "is anyone interested in this dog?" gets answered. Meaningful from both sides, so neither Animal nor Adopter owns it; it carries the facts that describe the transaction itself rather than either party.',
         NULL,
         'Adoption',
         'vwAdoptions',
         '${flyway:defaultSchema}',
         1,
         1,
         1
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ: Adoptions to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'a2425230-0f81-413b-b391-98d246e04020', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Adoptions for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('a2425230-0f81-413b-b391-98d246e04020', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Adoptions for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('a2425230-0f81-413b-b391-98d246e04020', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Adoptions for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('a2425230-0f81-413b-b391-98d246e04020', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Dog */
ALTER TABLE [${flyway:defaultSchema}].[Dog] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Dog */
UPDATE [${flyway:defaultSchema}].[Dog] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Dog */
ALTER TABLE [${flyway:defaultSchema}].[Dog] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Dog */
ALTER TABLE [${flyway:defaultSchema}].[Dog] ADD CONSTRAINT [DF___mj_Dog___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Dog */
ALTER TABLE [${flyway:defaultSchema}].[Dog] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Dog */
UPDATE [${flyway:defaultSchema}].[Dog] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Dog */
ALTER TABLE [${flyway:defaultSchema}].[Dog] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Dog */
ALTER TABLE [${flyway:defaultSchema}].[Dog] ADD CONSTRAINT [DF___mj_Dog___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Adopter */
ALTER TABLE [${flyway:defaultSchema}].[Adopter] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Adopter */
UPDATE [${flyway:defaultSchema}].[Adopter] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Adopter */
ALTER TABLE [${flyway:defaultSchema}].[Adopter] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Adopter */
ALTER TABLE [${flyway:defaultSchema}].[Adopter] ADD CONSTRAINT [DF___mj_Adopter___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Adopter */
ALTER TABLE [${flyway:defaultSchema}].[Adopter] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Adopter */
UPDATE [${flyway:defaultSchema}].[Adopter] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Adopter */
ALTER TABLE [${flyway:defaultSchema}].[Adopter] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Adopter */
ALTER TABLE [${flyway:defaultSchema}].[Adopter] ADD CONSTRAINT [DF___mj_Adopter___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Adoption */
ALTER TABLE [${flyway:defaultSchema}].[Adoption] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Adoption */
UPDATE [${flyway:defaultSchema}].[Adoption] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Adoption */
ALTER TABLE [${flyway:defaultSchema}].[Adoption] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Adoption */
ALTER TABLE [${flyway:defaultSchema}].[Adoption] ADD CONSTRAINT [DF___mj_Adoption___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Adoption */
ALTER TABLE [${flyway:defaultSchema}].[Adoption] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Adoption */
UPDATE [${flyway:defaultSchema}].[Adoption] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Adoption */
ALTER TABLE [${flyway:defaultSchema}].[Adoption] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Adoption */
ALTER TABLE [${flyway:defaultSchema}].[Adoption] ADD CONSTRAINT [DF___mj_Adoption___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Cat */
ALTER TABLE [${flyway:defaultSchema}].[Cat] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Cat */
UPDATE [${flyway:defaultSchema}].[Cat] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Cat */
ALTER TABLE [${flyway:defaultSchema}].[Cat] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Cat */
ALTER TABLE [${flyway:defaultSchema}].[Cat] ADD CONSTRAINT [DF___mj_Cat___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Cat */
ALTER TABLE [${flyway:defaultSchema}].[Cat] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Cat */
UPDATE [${flyway:defaultSchema}].[Cat] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Cat */
ALTER TABLE [${flyway:defaultSchema}].[Cat] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Cat */
ALTER TABLE [${flyway:defaultSchema}].[Cat] ADD CONSTRAINT [DF___mj_Cat___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 44 new entity field(s) */
UPDATE [${flyway:defaultSchema}].[EntityField]
         SET [Sequence] = [Sequence] + 100000
       WHERE [EntityID] = '64B7852D-9CEF-40C7-890C-0B3DBD7EED1A'
         AND [Sequence] < 100000;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a9eae87c-2656-4ee3-b03e-8640eaf0f98d' OR (EntityID = '64B7852D-9CEF-40C7-890C-0B3DBD7EED1A' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a9eae87c-2656-4ee3-b03e-8640eaf0f98d',
            '64B7852D-9CEF-40C7-890C-0B3DBD7EED1A', -- Entity: MJ: Dogs
            1,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            0,
            0,
            0,
            '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D',
            'ID',
            0,
            1,
            1,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2763736a-fe7e-4369-b35c-c5eb832ba837' OR (EntityID = '64B7852D-9CEF-40C7-890C-0B3DBD7EED1A' AND Name = 'EnergyLevel')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2763736a-fe7e-4369-b35c-c5eb832ba837',
            '64B7852D-9CEF-40C7-890C-0B3DBD7EED1A', -- Entity: MJ: Dogs
            2,
            'EnergyLevel',
            'Energy Level',
            'How much exercise this dog needs: Low, Moderate, High or Very High. Shelters assess and advertise this for dogs because it is the single biggest predictor of a returned adoption. NULL means not yet assessed.',
            'nvarchar',
            40,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e1382501-9ca1-4fa0-93f2-adc5168fbf47' OR (EntityID = '64B7852D-9CEF-40C7-890C-0B3DBD7EED1A' AND Name = 'IsLeashTrained')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e1382501-9ca1-4fa0-93f2-adc5168fbf47',
            '64B7852D-9CEF-40C7-890C-0B3DBD7EED1A', -- Entity: MJ: Dogs
            3,
            'IsLeashTrained',
            'Is Leash Trained',
            'Whether this dog walks acceptably on a leash. Dog-only: a cat is never leash trained in any sense the shelter tracks, which is why the column is here and not on Animal. NULL means not yet assessed.',
            'bit',
            1,
            1,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c3f0314a-39bb-40af-a456-f0998f2aef9c' OR (EntityID = '64B7852D-9CEF-40C7-890C-0B3DBD7EED1A' AND Name = 'IsHouseTrained')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c3f0314a-39bb-40af-a456-f0998f2aef9c',
            '64B7852D-9CEF-40C7-890C-0B3DBD7EED1A', -- Entity: MJ: Dogs
            4,
            'IsHouseTrained',
            'Is House Trained',
            'Whether this dog is reliably house trained. Named IsHouseTrained rather than sharing a column with the cat equivalent because the two mean different things -- a cat uses a litter box, tracked separately as Cat.IsLitterTrained. NULL means not yet assessed.',
            'bit',
            1,
            1,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5a9401d5-9952-4798-9b66-47081bf20c78' OR (EntityID = '64B7852D-9CEF-40C7-890C-0B3DBD7EED1A' AND Name = 'IsGoodWithDogs')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5a9401d5-9952-4798-9b66-47081bf20c78',
            '64B7852D-9CEF-40C7-890C-0B3DBD7EED1A', -- Entity: MJ: Dogs
            5,
            'IsGoodWithDogs',
            'Is Good With Dogs',
            'Whether this dog tolerates other dogs. Drives kennel pairing and playgroup decisions. NULL means not yet assessed.',
            'bit',
            1,
            1,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cec90b04-cc90-4ad3-b917-3f203be31301' OR (EntityID = '64B7852D-9CEF-40C7-890C-0B3DBD7EED1A' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cec90b04-cc90-4ad3-b917-3f203be31301',
            '64B7852D-9CEF-40C7-890C-0B3DBD7EED1A', -- Entity: MJ: Dogs
            6,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '61a84e6b-217c-4cae-8cb2-3d713277fb8c' OR (EntityID = '64B7852D-9CEF-40C7-890C-0B3DBD7EED1A' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '61a84e6b-217c-4cae-8cb2-3d713277fb8c',
            '64B7852D-9CEF-40C7-890C-0B3DBD7EED1A', -- Entity: MJ: Dogs
            7,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;
UPDATE [${flyway:defaultSchema}].[EntityField]
         SET [Sequence] = [Sequence] + 100000
       WHERE [EntityID] = '279F206B-822B-41BA-97B6-3BC705DB55AB'
         AND [Sequence] < 100000;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9f748b4d-fe7d-49ba-947a-a0ac9eaf6abb' OR (EntityID = '279F206B-822B-41BA-97B6-3BC705DB55AB' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9f748b4d-fe7d-49ba-947a-a0ac9eaf6abb',
            '279F206B-822B-41BA-97B6-3BC705DB55AB', -- Entity: MJ: Adopters
            1,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1d9f8278-37c4-4d16-9ac3-db62c67b5532' OR (EntityID = '279F206B-822B-41BA-97B6-3BC705DB55AB' AND Name = 'FirstName')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1d9f8278-37c4-4d16-9ac3-db62c67b5532',
            '279F206B-822B-41BA-97B6-3BC705DB55AB', -- Entity: MJ: Adopters
            2,
            'FirstName',
            'First Name',
            'The adopter''s given name.',
            'nvarchar',
            100,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8088a3cd-301e-40a9-8b40-83da62093c46' OR (EntityID = '279F206B-822B-41BA-97B6-3BC705DB55AB' AND Name = 'LastName')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8088a3cd-301e-40a9-8b40-83da62093c46',
            '279F206B-822B-41BA-97B6-3BC705DB55AB', -- Entity: MJ: Adopters
            3,
            'LastName',
            'Last Name',
            'The adopter''s family name.',
            'nvarchar',
            100,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7a1ae5ce-0037-4320-ab1d-3752d9fc1344' OR (EntityID = '279F206B-822B-41BA-97B6-3BC705DB55AB' AND Name = 'Email')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7a1ae5ce-0037-4320-ab1d-3752d9fc1344',
            '279F206B-822B-41BA-97B6-3BC705DB55AB', -- Entity: MJ: Adopters
            4,
            'Email',
            'Email',
            'Contact email, and the practical identity of an adopter -- unique, because two records for the same family split their history and hide a prior denial.',
            'nvarchar',
            510,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd751242c-ada4-4be1-b42b-baa285679f49' OR (EntityID = '279F206B-822B-41BA-97B6-3BC705DB55AB' AND Name = 'HousingType')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd751242c-ada4-4be1-b42b-baa285679f49',
            '279F206B-822B-41BA-97B6-3BC705DB55AB', -- Entity: MJ: Adopters
            5,
            'HousingType',
            'Housing Type',
            'What kind of home this is: House, Apartment, Condo, Farm or Other. One of the three matching signals a shelter actually screens on, alongside HasYard and HasOtherPets. NULL means not yet collected.',
            'nvarchar',
            40,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dc283c4f-d13b-4147-b30b-c7f798aaba2d' OR (EntityID = '279F206B-822B-41BA-97B6-3BC705DB55AB' AND Name = 'HasYard')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'dc283c4f-d13b-4147-b30b-c7f798aaba2d',
            '279F206B-822B-41BA-97B6-3BC705DB55AB', -- Entity: MJ: Adopters
            6,
            'HasYard',
            'Has Yard',
            'Whether the home has an enclosed yard. Matters most for the high-energy dogs Dog.EnergyLevel identifies. NULL means not yet collected.',
            'bit',
            1,
            1,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1f2422c2-b44b-4bcd-87d1-ed5b79174531' OR (EntityID = '279F206B-822B-41BA-97B6-3BC705DB55AB' AND Name = 'HasOtherPets')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1f2422c2-b44b-4bcd-87d1-ed5b79174531',
            '279F206B-822B-41BA-97B6-3BC705DB55AB', -- Entity: MJ: Adopters
            7,
            'HasOtherPets',
            'Has Other Pets',
            'Whether there are already animals in the home. Pairs with Dog.IsGoodWithDogs and Cat.IsGoodWithCats to decide whether a placement is plausible. NULL means not yet collected.',
            'bit',
            1,
            1,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '34575f75-7166-480e-8ff3-43b0cfa21422' OR (EntityID = '279F206B-822B-41BA-97B6-3BC705DB55AB' AND Name = 'IsApproved')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '34575f75-7166-480e-8ff3-43b0cfa21422',
            '279F206B-822B-41BA-97B6-3BC705DB55AB', -- Entity: MJ: Adopters
            8,
            'IsApproved',
            'Is Approved',
            'Whether this adopter has passed screening. A property of the PERSON, not of any one adoption, so it is recorded once and reused across every inquiry they make -- which is the whole reason Adopter is a separate entity rather than fields repeated on Adoption.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1090b685-05df-4e1d-a01b-06bb5a844d37' OR (EntityID = '279F206B-822B-41BA-97B6-3BC705DB55AB' AND Name = 'IsActive')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1090b685-05df-4e1d-a01b-06bb5a844d37',
            '279F206B-822B-41BA-97B6-3BC705DB55AB', -- Entity: MJ: Adopters
            9,
            'IsActive',
            'Is Active',
            'Soft retirement. An adopter who has moved away or asked to be removed is deactivated rather than deleted, because their completed adoptions are permanent history.',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7a66cf35-f3e1-4815-9566-539e864b193e' OR (EntityID = '279F206B-822B-41BA-97B6-3BC705DB55AB' AND Name = 'Name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7a66cf35-f3e1-4815-9566-539e864b193e',
            '279F206B-822B-41BA-97B6-3BC705DB55AB', -- Entity: MJ: Adopters
            10,
            'Name',
            'Name',
            'The adopter''s full display name, computed from FirstName + LastName and PERSISTED. It exists because MemberJunction needs a NAME FIELD: CodeGen marks a field as the entity''s name field only when it is literally called Name, and an entity without one cannot resolve display columns for foreign keys pointing at it on its FIRST metadata pass -- which turned a two-pass CodeGen into a three-pass one and left a clean deploy with metadata work outstanding. Measured limit: base views still join FirstName for the adopter display rather than this column, because a computed column is virtual to MJ and is not selected for that role. Computed rather than stored so it cannot drift from its parts, and PERSISTED so it can be indexed and read like any other column. MJ''s CRUD procedures exclude computed columns, so nothing attempts to write it.',
            'nvarchar',
            202,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
            1,
            NULL,
            NULL,
            1,
            1,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0a974127-e3a9-420b-a8c1-345403226e32' OR (EntityID = '279F206B-822B-41BA-97B6-3BC705DB55AB' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0a974127-e3a9-420b-a8c1-345403226e32',
            '279F206B-822B-41BA-97B6-3BC705DB55AB', -- Entity: MJ: Adopters
            11,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0e8d8c0d-9dad-45ae-90bd-58ce7bdc5357' OR (EntityID = '279F206B-822B-41BA-97B6-3BC705DB55AB' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0e8d8c0d-9dad-45ae-90bd-58ce7bdc5357',
            '279F206B-822B-41BA-97B6-3BC705DB55AB', -- Entity: MJ: Adopters
            12,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;
UPDATE [${flyway:defaultSchema}].[EntityField]
         SET [Sequence] = [Sequence] + 100000
       WHERE [EntityID] = 'A2425230-0F81-413B-B391-98D246E04020'
         AND [Sequence] < 100000;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '277e3bec-755b-44c9-aa64-89685a65b881' OR (EntityID = 'A2425230-0F81-413B-B391-98D246E04020' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '277e3bec-755b-44c9-aa64-89685a65b881',
            'A2425230-0F81-413B-B391-98D246E04020', -- Entity: MJ: Adoptions
            1,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9a4e3621-9e87-4f68-900e-db9ab2bbb840' OR (EntityID = 'A2425230-0F81-413B-B391-98D246E04020' AND Name = 'AnimalID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9a4e3621-9e87-4f68-900e-db9ab2bbb840',
            'A2425230-0F81-413B-B391-98D246E04020', -- Entity: MJ: Adoptions
            2,
            'AnimalID',
            'Animal ID',
            'The animal being enquired about.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f0e33b04-5f78-42bf-8f1c-495c735eba21' OR (EntityID = 'A2425230-0F81-413B-B391-98D246E04020' AND Name = 'AdopterID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f0e33b04-5f78-42bf-8f1c-495c735eba21',
            'A2425230-0F81-413B-B391-98D246E04020', -- Entity: MJ: Adoptions
            3,
            'AdopterID',
            'Adopter ID',
            'The family making the enquiry.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            '279F206B-822B-41BA-97B6-3BC705DB55AB',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bc1d1033-106e-46a3-8159-f417aa77e5e3' OR (EntityID = 'A2425230-0F81-413B-B391-98D246E04020' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'bc1d1033-106e-46a3-8159-f417aa77e5e3',
            'A2425230-0F81-413B-B391-98D246E04020', -- Entity: MJ: Adoptions
            4,
            'Status',
            'Status',
            'Where this adoption stands. Inquiry, Screening, Approved and Completed are a forward-only ladder; Withdrawn (the adopter pulled out), Denied (the shelter refused) and Cancelled (it fell through for some other reason) are exits reachable from any non-terminal state, because an adoption can collapse at any point. Completing one is what flips the animal to Adopted.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Inquiry',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '49589ab3-263d-479e-831e-85181fd07cc0' OR (EntityID = 'A2425230-0F81-413B-B391-98D246E04020' AND Name = 'InquiryDate')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '49589ab3-263d-479e-831e-85181fd07cc0',
            'A2425230-0F81-413B-B391-98D246E04020', -- Entity: MJ: Adoptions
            5,
            'InquiryDate',
            'Inquiry Date',
            'When the family first asked about this animal. Set at creation and never moved, so the time an adoption took can always be measured.',
            'date',
            3,
            10,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f7671ecd-744f-4ec2-92d6-80fe232dc991' OR (EntityID = 'A2425230-0F81-413B-B391-98D246E04020' AND Name = 'CompletedDate')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f7671ecd-744f-4ec2-92d6-80fe232dc991',
            'A2425230-0F81-413B-B391-98D246E04020', -- Entity: MJ: Adoptions
            6,
            'CompletedDate',
            'Completed Date',
            'When the adoption completed. Required whenever Status is Completed and enforced by a check constraint, because a completed adoption with no date is unusable in every report that matters.',
            'date',
            3,
            10,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b49a6218-6b8f-45ca-a49d-9d35ceabf898' OR (EntityID = 'A2425230-0F81-413B-B391-98D246E04020' AND Name = 'Fee')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b49a6218-6b8f-45ca-a49d-9d35ceabf898',
            'A2425230-0F81-413B-B391-98D246E04020', -- Entity: MJ: Adoptions
            7,
            'Fee',
            'Fee',
            'The adoption fee agreed for this placement. Lives here rather than on Animal or Adopter because it describes the transaction: the same animal can be waived a fee for one family and not another.',
            'decimal',
            9,
            18,
            2,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '764179a8-b8b9-41e8-a490-54347df97391' OR (EntityID = 'A2425230-0F81-413B-B391-98D246E04020' AND Name = 'DenialReason')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '764179a8-b8b9-41e8-a490-54347df97391',
            'A2425230-0F81-413B-B391-98D246E04020', -- Entity: MJ: Adoptions
            8,
            'DenialReason',
            'Denial Reason',
            'Why the shelter refused. Required whenever Status is Denied and enforced by a check constraint: a rejection with no recorded reason cannot be explained to the applicant later and cannot be reviewed for fairness.',
            'nvarchar',
            1000,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f3d8155-4072-4fb3-b1ad-2f1ea660bd4f' OR (EntityID = 'A2425230-0F81-413B-B391-98D246E04020' AND Name = 'Notes')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f3d8155-4072-4fb3-b1ad-2f1ea660bd4f',
            'A2425230-0F81-413B-B391-98D246E04020', -- Entity: MJ: Adoptions
            9,
            'Notes',
            'Notes',
            'Free-text detail about this particular enquiry -- home visit observations, scheduling, what the family is looking for.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f28dfe35-3833-42d6-96fd-1261d826770e' OR (EntityID = 'A2425230-0F81-413B-B391-98D246E04020' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f28dfe35-3833-42d6-96fd-1261d826770e',
            'A2425230-0F81-413B-B391-98D246E04020', -- Entity: MJ: Adoptions
            10,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cc1abba4-9d7b-4390-ba4c-1ea022ebd3dd' OR (EntityID = 'A2425230-0F81-413B-B391-98D246E04020' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cc1abba4-9d7b-4390-ba4c-1ea022ebd3dd',
            'A2425230-0F81-413B-B391-98D246E04020', -- Entity: MJ: Adoptions
            11,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;
UPDATE [${flyway:defaultSchema}].[EntityField]
         SET [Sequence] = [Sequence] + 100000
       WHERE [EntityID] = '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D'
         AND [Sequence] < 100000;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9b7ac55a-e87e-4f26-9be2-bcc5915fa44f' OR (EntityID = '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D' AND Name = 'IsGoodWithPeople')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9b7ac55a-e87e-4f26-9be2-bcc5915fa44f',
            '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D', -- Entity: MJ: Animals
            -- MJ #4202: the capture emitted a literal 17 -- the field count on the database
            -- it came from. Resolved at APPLY time so this works wherever MJ: Animals has a different
            -- number of fields. (Fixed upstream in MJ PR #4292; our v6.1.0-edge.4 pin predates it.)
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D') + 1,
            'IsGoodWithPeople',
            'Is Good With People',
            'Whether this animal is comfortable around people. Lives on Animal rather than on the Dog and Cat subtypes because it is asked of every animal identically -- an attribute shared by all subtypes belongs on the parent. NULL means not yet assessed, which is deliberately distinct from a recorded No: an animal is logged at intake and evaluated later.',
            'bit',
            1,
            1,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'de7bd5d6-f7d9-43d6-bcfb-5f50dadcc643' OR (EntityID = '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D' AND Name = 'Notes')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'de7bd5d6-f7d9-43d6-bcfb-5f50dadcc643',
            '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D', -- Entity: MJ: Animals
            -- MJ #4202: the capture emitted a literal 18 -- the field count on the database
            -- it came from. Resolved at APPLY time so this works wherever MJ: Animals has a different
            -- number of fields. (Fixed upstream in MJ PR #4292; our v6.1.0-edge.4 pin predates it.)
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D') + 1,
            'Notes',
            'Notes',
            'Internal staff notes about this animal -- the escape hatch for the odd descriptive thing that has no column of its own. Distinct from Description, which is the outward-facing blurb an adopter reads: Notes is where "bolts the door if you leave it ajar" or "only eats the pate food" goes. Lives on Animal rather than on the Dog and Cat subtypes for exactly the same reason IsGoodWithPeople does -- staff take notes on every animal identically, so an attribute shared by all subtypes belongs on the parent.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;
UPDATE [${flyway:defaultSchema}].[EntityField]
         SET [Sequence] = [Sequence] + 100000
       WHERE [EntityID] = 'B7B001CB-8219-4CF9-B507-FF85D99A9F77'
         AND [Sequence] < 100000;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a25213e4-d9fc-4dcd-8143-364ee242a372' OR (EntityID = 'B7B001CB-8219-4CF9-B507-FF85D99A9F77' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a25213e4-d9fc-4dcd-8143-364ee242a372',
            'B7B001CB-8219-4CF9-B507-FF85D99A9F77', -- Entity: MJ: Cats
            1,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            0,
            0,
            0,
            '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D',
            'ID',
            0,
            1,
            1,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '168affeb-5fe7-4851-bc15-741eafffeb5f' OR (EntityID = 'B7B001CB-8219-4CF9-B507-FF85D99A9F77' AND Name = 'IsIndoorOnly')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '168affeb-5fe7-4851-bc15-741eafffeb5f',
            'B7B001CB-8219-4CF9-B507-FF85D99A9F77', -- Entity: MJ: Cats
            2,
            'IsIndoorOnly',
            'Is Indoor Only',
            'Whether this cat must be placed in an indoor-only home. A placement condition specific to cats, commonly required for declawed or FIV-positive animals. NULL means not yet assessed.',
            'bit',
            1,
            1,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '55e97fff-bda8-47c2-88a0-0676ae4668ee' OR (EntityID = 'B7B001CB-8219-4CF9-B507-FF85D99A9F77' AND Name = 'IsDeclawed')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '55e97fff-bda8-47c2-88a0-0676ae4668ee',
            'B7B001CB-8219-4CF9-B507-FF85D99A9F77', -- Entity: MJ: Cats
            3,
            'IsDeclawed',
            'Is Declawed',
            'Whether this cat has been declawed. Recorded because it is adoption-relevant -- a declawed cat generally cannot be placed outdoors -- and because it is surgical history the shelter did not perform and must not lose. NULL means not known.',
            'bit',
            1,
            1,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '264f9a8e-3046-4c8d-bc36-92a2230ed459' OR (EntityID = 'B7B001CB-8219-4CF9-B507-FF85D99A9F77' AND Name = 'IsLitterTrained')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '264f9a8e-3046-4c8d-bc36-92a2230ed459',
            'B7B001CB-8219-4CF9-B507-FF85D99A9F77', -- Entity: MJ: Cats
            4,
            'IsLitterTrained',
            'Is Litter Trained',
            'Whether this cat reliably uses a litter box. The cat equivalent of Dog.IsHouseTrained, deliberately given its own name because the two are different behaviours. NULL means not yet assessed.',
            'bit',
            1,
            1,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '447cba45-7dc8-42a9-980f-600d4034252d' OR (EntityID = 'B7B001CB-8219-4CF9-B507-FF85D99A9F77' AND Name = 'IsGoodWithCats')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '447cba45-7dc8-42a9-980f-600d4034252d',
            'B7B001CB-8219-4CF9-B507-FF85D99A9F77', -- Entity: MJ: Cats
            5,
            'IsGoodWithCats',
            'Is Good With Cats',
            'Whether this cat tolerates other cats. Decides whether it can share a condo and whether it can go to a multi-cat home. NULL means not yet assessed.',
            'bit',
            1,
            1,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cf8ca7d6-cd4b-4570-8cfb-b0b7b03d8234' OR (EntityID = 'B7B001CB-8219-4CF9-B507-FF85D99A9F77' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cf8ca7d6-cd4b-4570-8cfb-b0b7b03d8234',
            'B7B001CB-8219-4CF9-B507-FF85D99A9F77', -- Entity: MJ: Cats
            6,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f8a46acf-4929-4fff-8864-2ff5f257747d' OR (EntityID = 'B7B001CB-8219-4CF9-B507-FF85D99A9F77' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f8a46acf-4929-4fff-8864-2ff5f257747d',
            'B7B001CB-8219-4CF9-B507-FF85D99A9F77', -- Entity: MJ: Cats
            7,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert entity field value with ID 37eae1a3-2895-4c06-86ac-f7dbf910fd3a */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('37eae1a3-2895-4c06-86ac-f7dbf910fd3a', '2763736A-FE7E-4369-B35C-C5EB832BA837', 1, 'High', 'High', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 16267bb3-1812-4567-9991-ec645c420de4 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('16267bb3-1812-4567-9991-ec645c420de4', '2763736A-FE7E-4369-B35C-C5EB832BA837', 2, 'Low', 'Low', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID c93936ad-2623-4683-a874-4ef70921817b */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c93936ad-2623-4683-a874-4ef70921817b', '2763736A-FE7E-4369-B35C-C5EB832BA837', 3, 'Moderate', 'Moderate', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID a677d497-00ba-4018-a191-6b6ddbdbd437 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a677d497-00ba-4018-a191-6b6ddbdbd437', '2763736A-FE7E-4369-B35C-C5EB832BA837', 4, 'Very High', 'Very High', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 2763736A-FE7E-4369-B35C-C5EB832BA837 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='2763736A-FE7E-4369-B35C-C5EB832BA837';

/* SQL text to insert entity field value with ID 97bacac9-dce3-43a8-b6c4-b03c4ea2e1ca */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('97bacac9-dce3-43a8-b6c4-b03c4ea2e1ca', 'D751242C-ADA4-4BE1-B42B-BAA285679F49', 1, 'Apartment', 'Apartment', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID a16f38a4-f3d4-4f74-b166-1a329277b24f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a16f38a4-f3d4-4f74-b166-1a329277b24f', 'D751242C-ADA4-4BE1-B42B-BAA285679F49', 2, 'Condo', 'Condo', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 475100fe-7e3d-40bf-8b49-b32333b037a9 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('475100fe-7e3d-40bf-8b49-b32333b037a9', 'D751242C-ADA4-4BE1-B42B-BAA285679F49', 3, 'Farm', 'Farm', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID d3717475-3def-4638-953b-2cb29f0be5d4 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d3717475-3def-4638-953b-2cb29f0be5d4', 'D751242C-ADA4-4BE1-B42B-BAA285679F49', 4, 'House', 'House', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 19da6c7f-64d3-4ca6-a1d9-7f1bae920198 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('19da6c7f-64d3-4ca6-a1d9-7f1bae920198', 'D751242C-ADA4-4BE1-B42B-BAA285679F49', 5, 'Other', 'Other', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID D751242C-ADA4-4BE1-B42B-BAA285679F49 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='D751242C-ADA4-4BE1-B42B-BAA285679F49';

/* SQL text to insert entity field value with ID 4d654b0b-fcc5-40ef-a0cf-f0c6a2fe46b7 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4d654b0b-fcc5-40ef-a0cf-f0c6a2fe46b7', 'BC1D1033-106E-46A3-8159-F417AA77E5E3', 1, 'Approved', 'Approved', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 56269bee-cbff-422c-9b65-e0efc59fc132 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('56269bee-cbff-422c-9b65-e0efc59fc132', 'BC1D1033-106E-46A3-8159-F417AA77E5E3', 2, 'Cancelled', 'Cancelled', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 8e9f59ee-6fa7-4ed9-ae1c-c17ffd2bb9f0 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('8e9f59ee-6fa7-4ed9-ae1c-c17ffd2bb9f0', 'BC1D1033-106E-46A3-8159-F417AA77E5E3', 3, 'Completed', 'Completed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 00ffdd9a-5c08-48e5-83dc-08ac5c8b9666 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('00ffdd9a-5c08-48e5-83dc-08ac5c8b9666', 'BC1D1033-106E-46A3-8159-F417AA77E5E3', 4, 'Denied', 'Denied', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID e5ee41b6-93fd-4688-a23a-da9f54661383 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e5ee41b6-93fd-4688-a23a-da9f54661383', 'BC1D1033-106E-46A3-8159-F417AA77E5E3', 5, 'Inquiry', 'Inquiry', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 78bdf482-e5f5-4ead-9afb-4d520e41cc08 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('78bdf482-e5f5-4ead-9afb-4d520e41cc08', 'BC1D1033-106E-46A3-8159-F417AA77E5E3', 6, 'Screening', 'Screening', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID c39a39ba-b3a0-41f1-bec8-fddd4657c9c0 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c39a39ba-b3a0-41f1-bec8-fddd4657c9c0', 'BC1D1033-106E-46A3-8159-F417AA77E5E3', 7, 'Withdrawn', 'Withdrawn', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID BC1D1033-106E-46A3-8159-F417AA77E5E3 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='BC1D1033-106E-46A3-8159-F417AA77E5E3';


/* Create Entity Relationship: MJ: Adopters -> MJ: Adoptions (One To Many via AdopterID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '0ae9d8ce-5f54-4246-bc97-d62931510e72'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('0ae9d8ce-5f54-4246-bc97-d62931510e72', '279F206B-822B-41BA-97B6-3BC705DB55AB', 'A2425230-0F81-413B-B391-98D246E04020', 'AdopterID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Animals -> MJ: Cats (One To Many via ID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '6aa463c8-7275-4eaf-8b7c-9a1fa4172e50'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('6aa463c8-7275-4eaf-8b7c-9a1fa4172e50', '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D', 'B7B001CB-8219-4CF9-B507-FF85D99A9F77', 'ID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Animals -> MJ: Dogs (One To Many via ID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '1e59e74f-6004-42a5-b96e-d920ac317105'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('1e59e74f-6004-42a5-b96e-d920ac317105', '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D', '64B7852D-9CEF-40C7-890C-0B3DBD7EED1A', 'ID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Animals -> MJ: Adoptions (One To Many via AnimalID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'a8811174-189c-4f07-865c-4548a98d5ab1'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('a8811174-189c-4f07-865c-4548a98d5ab1', '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D', 'A2425230-0F81-413B-B391-98D246E04020', 'AnimalID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;

/* Set IS-A ParentID for "MJ: Dogs" → "MJ: Animals" */
UPDATE [${flyway:defaultSchema}].[Entity]
                                  SET [__mj_UpdatedAt]=GETUTCDATE(),
                                      [ParentID] = '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D'
                                  WHERE [ID] = '64B7852D-9CEF-40C7-890C-0B3DBD7EED1A';

/* Set IS-A ParentID for "MJ: Cats" → "MJ: Animals" */
UPDATE [${flyway:defaultSchema}].[Entity]
                                  SET [__mj_UpdatedAt]=GETUTCDATE(),
                                      [ParentID] = '22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D'
                                  WHERE [ID] = 'B7B001CB-8219-4CF9-B507-FF85D99A9F77';

/* Index for Foreign Keys for Adopter */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Adopters
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for Adoption */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Adoptions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AnimalID in table Adoption
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Adoption_AnimalID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Adoption]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Adoption_AnimalID ON [${flyway:defaultSchema}].[Adoption] ([AnimalID]);

-- Index for foreign key AdopterID in table Adoption
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Adoption_AdopterID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Adoption]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Adoption_AdopterID ON [${flyway:defaultSchema}].[Adoption] ([AdopterID]);

/* SQL text to update entity field related entity name field map for entity field ID 9A4E3621-9E87-4F68-900E-DB9AB2BBB840 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='9A4E3621-9E87-4F68-900E-DB9AB2BBB840', @RelatedEntityNameFieldMap='Animal';

/* Base View SQL for MJ: Adopters */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Adopters
-- Item: vwAdopters
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Adopters
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Adopter
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAdopters]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAdopters];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAdopters]
AS
SELECT
    a.*
FROM
    [${flyway:defaultSchema}].[Adopter] AS a
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAdopters] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Adopters */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Adopters
-- Item: Permissions for vwAdopters
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAdopters] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Adopters */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Adopters
-- Item: spCreateAdopter
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Adopter
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAdopter]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAdopter];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAdopter]
    @ID uniqueidentifier = NULL,
    @FirstName nvarchar(50),
    @LastName nvarchar(50),
    @Email nvarchar(255),
    @HousingType_Clear bit = 0,
    @HousingType nvarchar(20) = NULL,
    @HasYard_Clear bit = 0,
    @HasYard bit = NULL,
    @HasOtherPets_Clear bit = 0,
    @HasOtherPets bit = NULL,
    @IsApproved bit = NULL,
    @IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Adopter]
            (
                [ID],
                [FirstName],
                [LastName],
                [Email],
                [HousingType],
                [HasYard],
                [HasOtherPets],
                [IsApproved],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @FirstName,
                @LastName,
                @Email,
                CASE WHEN @HousingType_Clear = 1 THEN NULL ELSE ISNULL(@HousingType, NULL) END,
                CASE WHEN @HasYard_Clear = 1 THEN NULL ELSE ISNULL(@HasYard, NULL) END,
                CASE WHEN @HasOtherPets_Clear = 1 THEN NULL ELSE ISNULL(@HasOtherPets, NULL) END,
                ISNULL(@IsApproved, 0),
                ISNULL(@IsActive, 1)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Adopter]
            (
                [FirstName],
                [LastName],
                [Email],
                [HousingType],
                [HasYard],
                [HasOtherPets],
                [IsApproved],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @FirstName,
                @LastName,
                @Email,
                CASE WHEN @HousingType_Clear = 1 THEN NULL ELSE ISNULL(@HousingType, NULL) END,
                CASE WHEN @HasYard_Clear = 1 THEN NULL ELSE ISNULL(@HasYard, NULL) END,
                CASE WHEN @HasOtherPets_Clear = 1 THEN NULL ELSE ISNULL(@HasOtherPets, NULL) END,
                ISNULL(@IsApproved, 0),
                ISNULL(@IsActive, 1)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAdopters] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAdopter] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Adopters */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAdopter] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Adopters */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Adopters
-- Item: spUpdateAdopter
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Adopter
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAdopter]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAdopter];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAdopter]
    @ID uniqueidentifier,
    @FirstName nvarchar(50) = NULL,
    @LastName nvarchar(50) = NULL,
    @Email nvarchar(255) = NULL,
    @HousingType_Clear bit = 0,
    @HousingType nvarchar(20) = NULL,
    @HasYard_Clear bit = 0,
    @HasYard bit = NULL,
    @HasOtherPets_Clear bit = 0,
    @HasOtherPets bit = NULL,
    @IsApproved bit = NULL,
    @IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Adopter]
    SET
        [FirstName] = ISNULL(@FirstName, [FirstName]),
        [LastName] = ISNULL(@LastName, [LastName]),
        [Email] = ISNULL(@Email, [Email]),
        [HousingType] = CASE WHEN @HousingType_Clear = 1 THEN NULL ELSE ISNULL(@HousingType, [HousingType]) END,
        [HasYard] = CASE WHEN @HasYard_Clear = 1 THEN NULL ELSE ISNULL(@HasYard, [HasYard]) END,
        [HasOtherPets] = CASE WHEN @HasOtherPets_Clear = 1 THEN NULL ELSE ISNULL(@HasOtherPets, [HasOtherPets]) END,
        [IsApproved] = ISNULL(@IsApproved, [IsApproved]),
        [IsActive] = ISNULL(@IsActive, [IsActive])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAdopters] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAdopters]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAdopter] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Adopter table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAdopter]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAdopter];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAdopter
ON [${flyway:defaultSchema}].[Adopter]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Adopter]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Adopter] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Adopters */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAdopter] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Adopters */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Adopters
-- Item: spDeleteAdopter
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Adopter
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAdopter]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAdopter];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAdopter]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Adopter]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAdopter] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Adopters */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAdopter] TO [cdp_Developer], [cdp_Integration];

/* SQL text to update entity field related entity name field map for entity field ID F0E33B04-5F78-42BF-8F1C-495C735EBA21 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='F0E33B04-5F78-42BF-8F1C-495C735EBA21', @RelatedEntityNameFieldMap='Adopter';

/* Base View SQL for MJ: Adoptions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Adoptions
-- Item: vwAdoptions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Adoptions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Adoption
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAdoptions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAdoptions];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAdoptions]
AS
SELECT
    a.*,
    MJAnimal_AnimalID.[Name] AS [Animal],
    MJAdopter_AdopterID.[Name] AS [Adopter]
FROM
    [${flyway:defaultSchema}].[Adoption] AS a
INNER JOIN
    [${flyway:defaultSchema}].[Animal] AS MJAnimal_AnimalID
  ON
    [a].[AnimalID] = MJAnimal_AnimalID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Adopter] AS MJAdopter_AdopterID
  ON
    [a].[AdopterID] = MJAdopter_AdopterID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAdoptions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Adoptions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Adoptions
-- Item: Permissions for vwAdoptions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAdoptions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Adoptions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Adoptions
-- Item: spCreateAdoption
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Adoption
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAdoption]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAdoption];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAdoption]
    @ID uniqueidentifier = NULL,
    @AnimalID uniqueidentifier,
    @AdopterID uniqueidentifier,
    @Status nvarchar(20) = NULL,
    @InquiryDate date,
    @CompletedDate_Clear bit = 0,
    @CompletedDate date = NULL,
    @Fee_Clear bit = 0,
    @Fee decimal(18, 2) = NULL,
    @DenialReason_Clear bit = 0,
    @DenialReason nvarchar(500) = NULL,
    @Notes_Clear bit = 0,
    @Notes nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Adoption]
            (
                [ID],
                [AnimalID],
                [AdopterID],
                [Status],
                [InquiryDate],
                [CompletedDate],
                [Fee],
                [DenialReason],
                [Notes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @AnimalID,
                @AdopterID,
                ISNULL(@Status, 'Inquiry'),
                @InquiryDate,
                CASE WHEN @CompletedDate_Clear = 1 THEN NULL ELSE ISNULL(@CompletedDate, NULL) END,
                CASE WHEN @Fee_Clear = 1 THEN NULL ELSE ISNULL(@Fee, NULL) END,
                CASE WHEN @DenialReason_Clear = 1 THEN NULL ELSE ISNULL(@DenialReason, NULL) END,
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Adoption]
            (
                [AnimalID],
                [AdopterID],
                [Status],
                [InquiryDate],
                [CompletedDate],
                [Fee],
                [DenialReason],
                [Notes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @AnimalID,
                @AdopterID,
                ISNULL(@Status, 'Inquiry'),
                @InquiryDate,
                CASE WHEN @CompletedDate_Clear = 1 THEN NULL ELSE ISNULL(@CompletedDate, NULL) END,
                CASE WHEN @Fee_Clear = 1 THEN NULL ELSE ISNULL(@Fee, NULL) END,
                CASE WHEN @DenialReason_Clear = 1 THEN NULL ELSE ISNULL(@DenialReason, NULL) END,
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAdoptions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAdoption] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Adoptions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAdoption] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Adoptions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Adoptions
-- Item: spUpdateAdoption
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Adoption
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAdoption]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAdoption];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAdoption]
    @ID uniqueidentifier,
    @AnimalID uniqueidentifier = NULL,
    @AdopterID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @InquiryDate date = NULL,
    @CompletedDate_Clear bit = 0,
    @CompletedDate date = NULL,
    @Fee_Clear bit = 0,
    @Fee decimal(18, 2) = NULL,
    @DenialReason_Clear bit = 0,
    @DenialReason nvarchar(500) = NULL,
    @Notes_Clear bit = 0,
    @Notes nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Adoption]
    SET
        [AnimalID] = ISNULL(@AnimalID, [AnimalID]),
        [AdopterID] = ISNULL(@AdopterID, [AdopterID]),
        [Status] = ISNULL(@Status, [Status]),
        [InquiryDate] = ISNULL(@InquiryDate, [InquiryDate]),
        [CompletedDate] = CASE WHEN @CompletedDate_Clear = 1 THEN NULL ELSE ISNULL(@CompletedDate, [CompletedDate]) END,
        [Fee] = CASE WHEN @Fee_Clear = 1 THEN NULL ELSE ISNULL(@Fee, [Fee]) END,
        [DenialReason] = CASE WHEN @DenialReason_Clear = 1 THEN NULL ELSE ISNULL(@DenialReason, [DenialReason]) END,
        [Notes] = CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, [Notes]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAdoptions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAdoptions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAdoption] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Adoption table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAdoption]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAdoption];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAdoption
ON [${flyway:defaultSchema}].[Adoption]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Adoption]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Adoption] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Adoptions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAdoption] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Adoptions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Adoptions
-- Item: spDeleteAdoption
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Adoption
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAdoption]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAdoption];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAdoption]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Adoption]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAdoption] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Adoptions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAdoption] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for Animal */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Animals
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key BreedID in table Animal
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Animal_BreedID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Animal]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Animal_BreedID ON [${flyway:defaultSchema}].[Animal] ([BreedID]);

-- Index for foreign key HousingID in table Animal
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Animal_HousingID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Animal]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Animal_HousingID ON [${flyway:defaultSchema}].[Animal] ([HousingID]);

/* Base View SQL for MJ: Animals */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Animals
-- Item: vwAnimals
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Animals
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Animal
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAnimals]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAnimals];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAnimals]
AS
SELECT
    a.*,
    MJBreed_BreedID.[Name] AS [Breed],
    MJHousing_HousingID.[Name] AS [Housing]
FROM
    [${flyway:defaultSchema}].[Animal] AS a
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Breed] AS MJBreed_BreedID
  ON
    [a].[BreedID] = MJBreed_BreedID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Housing] AS MJHousing_HousingID
  ON
    [a].[HousingID] = MJHousing_HousingID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAnimals] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Animals */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Animals
-- Item: Permissions for vwAnimals
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAnimals] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Animals */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Animals
-- Item: spCreateAnimal
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Animal
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAnimal]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAnimal];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAnimal]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Species nvarchar(20),
    @BreedID_Clear bit = 0,
    @BreedID uniqueidentifier = NULL,
    @MicrochipNumber_Clear bit = 0,
    @MicrochipNumber nvarchar(30) = NULL,
    @IntakeDate date,
    @IntakeReason_Clear bit = 0,
    @IntakeReason nvarchar(30) = NULL,
    @Sex_Clear bit = 0,
    @Sex nvarchar(10) = NULL,
    @EstimatedBirthDate_Clear bit = 0,
    @EstimatedBirthDate date = NULL,
    @WeightKg_Clear bit = 0,
    @WeightKg decimal(6, 2) = NULL,
    @Status nvarchar(20) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @PhotoBase64_Clear bit = 0,
    @PhotoBase64 nvarchar(MAX) = NULL,
    @HousingID_Clear bit = 0,
    @HousingID uniqueidentifier = NULL,
    @IsGoodWithPeople_Clear bit = 0,
    @IsGoodWithPeople bit = NULL,
    @Notes_Clear bit = 0,
    @Notes nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Animal]
            (
                [ID],
                [Name],
                [Species],
                [BreedID],
                [MicrochipNumber],
                [IntakeDate],
                [IntakeReason],
                [Sex],
                [EstimatedBirthDate],
                [WeightKg],
                [Status],
                [Description],
                [PhotoBase64],
                [HousingID],
                [IsGoodWithPeople],
                [Notes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Species,
                CASE WHEN @BreedID_Clear = 1 THEN NULL ELSE ISNULL(@BreedID, NULL) END,
                CASE WHEN @MicrochipNumber_Clear = 1 THEN NULL ELSE ISNULL(@MicrochipNumber, NULL) END,
                @IntakeDate,
                CASE WHEN @IntakeReason_Clear = 1 THEN NULL ELSE ISNULL(@IntakeReason, NULL) END,
                CASE WHEN @Sex_Clear = 1 THEN NULL ELSE ISNULL(@Sex, NULL) END,
                CASE WHEN @EstimatedBirthDate_Clear = 1 THEN NULL ELSE ISNULL(@EstimatedBirthDate, NULL) END,
                CASE WHEN @WeightKg_Clear = 1 THEN NULL ELSE ISNULL(@WeightKg, NULL) END,
                ISNULL(@Status, 'Intake'),
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @PhotoBase64_Clear = 1 THEN NULL ELSE ISNULL(@PhotoBase64, NULL) END,
                CASE WHEN @HousingID_Clear = 1 THEN NULL ELSE ISNULL(@HousingID, NULL) END,
                CASE WHEN @IsGoodWithPeople_Clear = 1 THEN NULL ELSE ISNULL(@IsGoodWithPeople, NULL) END,
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Animal]
            (
                [Name],
                [Species],
                [BreedID],
                [MicrochipNumber],
                [IntakeDate],
                [IntakeReason],
                [Sex],
                [EstimatedBirthDate],
                [WeightKg],
                [Status],
                [Description],
                [PhotoBase64],
                [HousingID],
                [IsGoodWithPeople],
                [Notes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Species,
                CASE WHEN @BreedID_Clear = 1 THEN NULL ELSE ISNULL(@BreedID, NULL) END,
                CASE WHEN @MicrochipNumber_Clear = 1 THEN NULL ELSE ISNULL(@MicrochipNumber, NULL) END,
                @IntakeDate,
                CASE WHEN @IntakeReason_Clear = 1 THEN NULL ELSE ISNULL(@IntakeReason, NULL) END,
                CASE WHEN @Sex_Clear = 1 THEN NULL ELSE ISNULL(@Sex, NULL) END,
                CASE WHEN @EstimatedBirthDate_Clear = 1 THEN NULL ELSE ISNULL(@EstimatedBirthDate, NULL) END,
                CASE WHEN @WeightKg_Clear = 1 THEN NULL ELSE ISNULL(@WeightKg, NULL) END,
                ISNULL(@Status, 'Intake'),
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @PhotoBase64_Clear = 1 THEN NULL ELSE ISNULL(@PhotoBase64, NULL) END,
                CASE WHEN @HousingID_Clear = 1 THEN NULL ELSE ISNULL(@HousingID, NULL) END,
                CASE WHEN @IsGoodWithPeople_Clear = 1 THEN NULL ELSE ISNULL(@IsGoodWithPeople, NULL) END,
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAnimals] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAnimal] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Animals */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAnimal] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Animals */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Animals
-- Item: spUpdateAnimal
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Animal
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAnimal]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAnimal];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAnimal]
    @ID uniqueidentifier,
    @Name nvarchar(100) = NULL,
    @Species nvarchar(20) = NULL,
    @BreedID_Clear bit = 0,
    @BreedID uniqueidentifier = NULL,
    @MicrochipNumber_Clear bit = 0,
    @MicrochipNumber nvarchar(30) = NULL,
    @IntakeDate date = NULL,
    @IntakeReason_Clear bit = 0,
    @IntakeReason nvarchar(30) = NULL,
    @Sex_Clear bit = 0,
    @Sex nvarchar(10) = NULL,
    @EstimatedBirthDate_Clear bit = 0,
    @EstimatedBirthDate date = NULL,
    @WeightKg_Clear bit = 0,
    @WeightKg decimal(6, 2) = NULL,
    @Status nvarchar(20) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @PhotoBase64_Clear bit = 0,
    @PhotoBase64 nvarchar(MAX) = NULL,
    @HousingID_Clear bit = 0,
    @HousingID uniqueidentifier = NULL,
    @IsGoodWithPeople_Clear bit = 0,
    @IsGoodWithPeople bit = NULL,
    @Notes_Clear bit = 0,
    @Notes nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Animal]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Species] = ISNULL(@Species, [Species]),
        [BreedID] = CASE WHEN @BreedID_Clear = 1 THEN NULL ELSE ISNULL(@BreedID, [BreedID]) END,
        [MicrochipNumber] = CASE WHEN @MicrochipNumber_Clear = 1 THEN NULL ELSE ISNULL(@MicrochipNumber, [MicrochipNumber]) END,
        [IntakeDate] = ISNULL(@IntakeDate, [IntakeDate]),
        [IntakeReason] = CASE WHEN @IntakeReason_Clear = 1 THEN NULL ELSE ISNULL(@IntakeReason, [IntakeReason]) END,
        [Sex] = CASE WHEN @Sex_Clear = 1 THEN NULL ELSE ISNULL(@Sex, [Sex]) END,
        [EstimatedBirthDate] = CASE WHEN @EstimatedBirthDate_Clear = 1 THEN NULL ELSE ISNULL(@EstimatedBirthDate, [EstimatedBirthDate]) END,
        [WeightKg] = CASE WHEN @WeightKg_Clear = 1 THEN NULL ELSE ISNULL(@WeightKg, [WeightKg]) END,
        [Status] = ISNULL(@Status, [Status]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [PhotoBase64] = CASE WHEN @PhotoBase64_Clear = 1 THEN NULL ELSE ISNULL(@PhotoBase64, [PhotoBase64]) END,
        [HousingID] = CASE WHEN @HousingID_Clear = 1 THEN NULL ELSE ISNULL(@HousingID, [HousingID]) END,
        [IsGoodWithPeople] = CASE WHEN @IsGoodWithPeople_Clear = 1 THEN NULL ELSE ISNULL(@IsGoodWithPeople, [IsGoodWithPeople]) END,
        [Notes] = CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, [Notes]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAnimals] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAnimals]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAnimal] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Animal table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAnimal]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAnimal];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAnimal
ON [${flyway:defaultSchema}].[Animal]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Animal]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Animal] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Animals */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAnimal] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Animals */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Animals
-- Item: spDeleteAnimal
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Animal
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAnimal]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAnimal];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAnimal]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Animal]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAnimal] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Animals */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAnimal] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for Cat */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Cats
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Base View SQL for MJ: Cats */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Cats
-- Item: vwCats
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Cats
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Cat
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwCats]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwCats];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwCats]
AS
SELECT
    c.*,
    ${flyway:defaultSchema}_isa_p1.[Name],
    ${flyway:defaultSchema}_isa_p1.[Species],
    ${flyway:defaultSchema}_isa_p1.[BreedID],
    ${flyway:defaultSchema}_isa_p1.[MicrochipNumber],
    ${flyway:defaultSchema}_isa_p1.[IntakeDate],
    ${flyway:defaultSchema}_isa_p1.[IntakeReason],
    ${flyway:defaultSchema}_isa_p1.[Sex],
    ${flyway:defaultSchema}_isa_p1.[EstimatedBirthDate],
    ${flyway:defaultSchema}_isa_p1.[WeightKg],
    ${flyway:defaultSchema}_isa_p1.[Status],
    ${flyway:defaultSchema}_isa_p1.[Description],
    ${flyway:defaultSchema}_isa_p1.[PhotoBase64],
    ${flyway:defaultSchema}_isa_p1.[HousingID],
    ${flyway:defaultSchema}_isa_p1.[IsGoodWithPeople],
    ${flyway:defaultSchema}_isa_p1.[Notes]
FROM
    [${flyway:defaultSchema}].[Cat] AS c
INNER JOIN
    [${flyway:defaultSchema}].[Animal] AS ${flyway:defaultSchema}_isa_p1
  ON
    [c].[ID] = ${flyway:defaultSchema}_isa_p1.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwCats] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Cats */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Cats
-- Item: Permissions for vwCats
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwCats] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Cats */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Cats
-- Item: spCreateCat
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Cat
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateCat]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateCat];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateCat]
    @ID uniqueidentifier = NULL,
    @IsIndoorOnly_Clear bit = 0,
    @IsIndoorOnly bit = NULL,
    @IsDeclawed_Clear bit = 0,
    @IsDeclawed bit = NULL,
    @IsLitterTrained_Clear bit = 0,
    @IsLitterTrained bit = NULL,
    @IsGoodWithCats_Clear bit = 0,
    @IsGoodWithCats bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ActualID UNIQUEIDENTIFIER = ISNULL(@ID, NEWID())
    INSERT INTO
    [${flyway:defaultSchema}].[Cat]
        (
            [IsIndoorOnly],
                [IsDeclawed],
                [IsLitterTrained],
                [IsGoodWithCats],
                [ID]
        )
    VALUES
        (
            CASE WHEN @IsIndoorOnly_Clear = 1 THEN NULL ELSE ISNULL(@IsIndoorOnly, NULL) END,
                CASE WHEN @IsDeclawed_Clear = 1 THEN NULL ELSE ISNULL(@IsDeclawed, NULL) END,
                CASE WHEN @IsLitterTrained_Clear = 1 THEN NULL ELSE ISNULL(@IsLitterTrained, NULL) END,
                CASE WHEN @IsGoodWithCats_Clear = 1 THEN NULL ELSE ISNULL(@IsGoodWithCats, NULL) END,
                @ActualID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwCats] WHERE [ID] = @ActualID
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCat] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Cats */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCat] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Cats */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Cats
-- Item: spUpdateCat
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Cat
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateCat]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateCat];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCat]
    @ID uniqueidentifier,
    @IsIndoorOnly_Clear bit = 0,
    @IsIndoorOnly bit = NULL,
    @IsDeclawed_Clear bit = 0,
    @IsDeclawed bit = NULL,
    @IsLitterTrained_Clear bit = 0,
    @IsLitterTrained bit = NULL,
    @IsGoodWithCats_Clear bit = 0,
    @IsGoodWithCats bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Cat]
    SET
        [IsIndoorOnly] = CASE WHEN @IsIndoorOnly_Clear = 1 THEN NULL ELSE ISNULL(@IsIndoorOnly, [IsIndoorOnly]) END,
        [IsDeclawed] = CASE WHEN @IsDeclawed_Clear = 1 THEN NULL ELSE ISNULL(@IsDeclawed, [IsDeclawed]) END,
        [IsLitterTrained] = CASE WHEN @IsLitterTrained_Clear = 1 THEN NULL ELSE ISNULL(@IsLitterTrained, [IsLitterTrained]) END,
        [IsGoodWithCats] = CASE WHEN @IsGoodWithCats_Clear = 1 THEN NULL ELSE ISNULL(@IsGoodWithCats, [IsGoodWithCats]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwCats] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwCats]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCat] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Cat table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateCat]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateCat];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateCat
ON [${flyway:defaultSchema}].[Cat]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Cat]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Cat] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Cats */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCat] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Cats */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Cats
-- Item: spDeleteCat
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Cat
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteCat]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteCat];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteCat]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Cat]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCat] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Cats */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCat] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for Dog */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dogs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Base View SQL for MJ: Dogs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dogs
-- Item: vwDogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Dogs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Dog
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwDogs]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwDogs];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwDogs]
AS
SELECT
    d.*,
    ${flyway:defaultSchema}_isa_p1.[Name],
    ${flyway:defaultSchema}_isa_p1.[Species],
    ${flyway:defaultSchema}_isa_p1.[BreedID],
    ${flyway:defaultSchema}_isa_p1.[MicrochipNumber],
    ${flyway:defaultSchema}_isa_p1.[IntakeDate],
    ${flyway:defaultSchema}_isa_p1.[IntakeReason],
    ${flyway:defaultSchema}_isa_p1.[Sex],
    ${flyway:defaultSchema}_isa_p1.[EstimatedBirthDate],
    ${flyway:defaultSchema}_isa_p1.[WeightKg],
    ${flyway:defaultSchema}_isa_p1.[Status],
    ${flyway:defaultSchema}_isa_p1.[Description],
    ${flyway:defaultSchema}_isa_p1.[PhotoBase64],
    ${flyway:defaultSchema}_isa_p1.[HousingID],
    ${flyway:defaultSchema}_isa_p1.[IsGoodWithPeople],
    ${flyway:defaultSchema}_isa_p1.[Notes]
FROM
    [${flyway:defaultSchema}].[Dog] AS d
INNER JOIN
    [${flyway:defaultSchema}].[Animal] AS ${flyway:defaultSchema}_isa_p1
  ON
    [d].[ID] = ${flyway:defaultSchema}_isa_p1.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwDogs] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Dogs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dogs
-- Item: Permissions for vwDogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwDogs] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Dogs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dogs
-- Item: spCreateDog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Dog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateDog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateDog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateDog]
    @ID uniqueidentifier = NULL,
    @EnergyLevel_Clear bit = 0,
    @EnergyLevel nvarchar(20) = NULL,
    @IsLeashTrained_Clear bit = 0,
    @IsLeashTrained bit = NULL,
    @IsHouseTrained_Clear bit = 0,
    @IsHouseTrained bit = NULL,
    @IsGoodWithDogs_Clear bit = 0,
    @IsGoodWithDogs bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ActualID UNIQUEIDENTIFIER = ISNULL(@ID, NEWID())
    INSERT INTO
    [${flyway:defaultSchema}].[Dog]
        (
            [EnergyLevel],
                [IsLeashTrained],
                [IsHouseTrained],
                [IsGoodWithDogs],
                [ID]
        )
    VALUES
        (
            CASE WHEN @EnergyLevel_Clear = 1 THEN NULL ELSE ISNULL(@EnergyLevel, NULL) END,
                CASE WHEN @IsLeashTrained_Clear = 1 THEN NULL ELSE ISNULL(@IsLeashTrained, NULL) END,
                CASE WHEN @IsHouseTrained_Clear = 1 THEN NULL ELSE ISNULL(@IsHouseTrained, NULL) END,
                CASE WHEN @IsGoodWithDogs_Clear = 1 THEN NULL ELSE ISNULL(@IsGoodWithDogs, NULL) END,
                @ActualID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwDogs] WHERE [ID] = @ActualID
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDog] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Dogs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDog] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Dogs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dogs
-- Item: spUpdateDog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Dog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateDog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateDog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateDog]
    @ID uniqueidentifier,
    @EnergyLevel_Clear bit = 0,
    @EnergyLevel nvarchar(20) = NULL,
    @IsLeashTrained_Clear bit = 0,
    @IsLeashTrained bit = NULL,
    @IsHouseTrained_Clear bit = 0,
    @IsHouseTrained bit = NULL,
    @IsGoodWithDogs_Clear bit = 0,
    @IsGoodWithDogs bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Dog]
    SET
        [EnergyLevel] = CASE WHEN @EnergyLevel_Clear = 1 THEN NULL ELSE ISNULL(@EnergyLevel, [EnergyLevel]) END,
        [IsLeashTrained] = CASE WHEN @IsLeashTrained_Clear = 1 THEN NULL ELSE ISNULL(@IsLeashTrained, [IsLeashTrained]) END,
        [IsHouseTrained] = CASE WHEN @IsHouseTrained_Clear = 1 THEN NULL ELSE ISNULL(@IsHouseTrained, [IsHouseTrained]) END,
        [IsGoodWithDogs] = CASE WHEN @IsGoodWithDogs_Clear = 1 THEN NULL ELSE ISNULL(@IsGoodWithDogs, [IsGoodWithDogs]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwDogs] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwDogs]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDog] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Dog table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateDog]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateDog];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateDog
ON [${flyway:defaultSchema}].[Dog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Dog]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Dog] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Dogs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDog] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Dogs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dogs
-- Item: spDeleteDog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Dog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteDog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteDog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteDog]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Dog]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDog] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Dogs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDog] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 35 new entity field(s) */
UPDATE [${flyway:defaultSchema}].[EntityField]
         SET [Sequence] = [Sequence] + 100000
       WHERE [EntityID] = '64B7852D-9CEF-40C7-890C-0B3DBD7EED1A'
         AND [Sequence] < 100000;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd228e4d1-5efc-448e-9892-39aa22ce74ae' OR (EntityID = '64B7852D-9CEF-40C7-890C-0B3DBD7EED1A' AND Name = 'Name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd228e4d1-5efc-448e-9892-39aa22ce74ae',
            '64B7852D-9CEF-40C7-890C-0B3DBD7EED1A', -- Entity: MJ: Dogs
            8,
            'Name',
            'Name',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            1,
            1,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '790afd67-aca7-49aa-9665-3c6ecfd4a531' OR (EntityID = '64B7852D-9CEF-40C7-890C-0B3DBD7EED1A' AND Name = 'Species')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '790afd67-aca7-49aa-9665-3c6ecfd4a531',
            '64B7852D-9CEF-40C7-890C-0B3DBD7EED1A', -- Entity: MJ: Dogs
            9,
            'Species',
            'Species',
            NULL,
            'nvarchar',
            40,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e6148679-7c93-481c-8919-29386c0282c7' OR (EntityID = '64B7852D-9CEF-40C7-890C-0B3DBD7EED1A' AND Name = 'BreedID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e6148679-7c93-481c-8919-29386c0282c7',
            '64B7852D-9CEF-40C7-890C-0B3DBD7EED1A', -- Entity: MJ: Dogs
            10,
            'BreedID',
            'Breed ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c1be5ff6-c95d-44d6-b1ff-79f203b4f13a' OR (EntityID = '64B7852D-9CEF-40C7-890C-0B3DBD7EED1A' AND Name = 'MicrochipNumber')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c1be5ff6-c95d-44d6-b1ff-79f203b4f13a',
            '64B7852D-9CEF-40C7-890C-0B3DBD7EED1A', -- Entity: MJ: Dogs
            11,
            'MicrochipNumber',
            'Microchip Number',
            NULL,
            'nvarchar',
            60,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b38f04f4-2ce4-4c8e-9bde-82beac063f80' OR (EntityID = '64B7852D-9CEF-40C7-890C-0B3DBD7EED1A' AND Name = 'IntakeDate')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b38f04f4-2ce4-4c8e-9bde-82beac063f80',
            '64B7852D-9CEF-40C7-890C-0B3DBD7EED1A', -- Entity: MJ: Dogs
            12,
            'IntakeDate',
            'Intake Date',
            NULL,
            'date',
            3,
            10,
            0,
            0,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '956b6876-b1df-434b-bb3f-08379cc319d9' OR (EntityID = '64B7852D-9CEF-40C7-890C-0B3DBD7EED1A' AND Name = 'IntakeReason')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '956b6876-b1df-434b-bb3f-08379cc319d9',
            '64B7852D-9CEF-40C7-890C-0B3DBD7EED1A', -- Entity: MJ: Dogs
            13,
            'IntakeReason',
            'Intake Reason',
            NULL,
            'nvarchar',
            60,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd68872af-4396-4078-ac98-316f6104d3f0' OR (EntityID = '64B7852D-9CEF-40C7-890C-0B3DBD7EED1A' AND Name = 'Sex')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd68872af-4396-4078-ac98-316f6104d3f0',
            '64B7852D-9CEF-40C7-890C-0B3DBD7EED1A', -- Entity: MJ: Dogs
            14,
            'Sex',
            'Sex',
            NULL,
            'nvarchar',
            20,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4b860356-4e0d-42f8-a163-412a22880481' OR (EntityID = '64B7852D-9CEF-40C7-890C-0B3DBD7EED1A' AND Name = 'EstimatedBirthDate')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4b860356-4e0d-42f8-a163-412a22880481',
            '64B7852D-9CEF-40C7-890C-0B3DBD7EED1A', -- Entity: MJ: Dogs
            15,
            'EstimatedBirthDate',
            'Estimated Birth Date',
            NULL,
            'date',
            3,
            10,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '233f7fd5-53d0-419a-bc20-e2f0a0983aa1' OR (EntityID = '64B7852D-9CEF-40C7-890C-0B3DBD7EED1A' AND Name = 'WeightKg')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '233f7fd5-53d0-419a-bc20-e2f0a0983aa1',
            '64B7852D-9CEF-40C7-890C-0B3DBD7EED1A', -- Entity: MJ: Dogs
            16,
            'WeightKg',
            'Weight Kg',
            NULL,
            'decimal',
            5,
            6,
            2,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '242fba43-d53d-43b6-8758-440e0eb06558' OR (EntityID = '64B7852D-9CEF-40C7-890C-0B3DBD7EED1A' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '242fba43-d53d-43b6-8758-440e0eb06558',
            '64B7852D-9CEF-40C7-890C-0B3DBD7EED1A', -- Entity: MJ: Dogs
            17,
            'Status',
            'Status',
            NULL,
            'nvarchar',
            40,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b8806e0c-95ec-4389-b941-0e1a93204042' OR (EntityID = '64B7852D-9CEF-40C7-890C-0B3DBD7EED1A' AND Name = 'Description')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b8806e0c-95ec-4389-b941-0e1a93204042',
            '64B7852D-9CEF-40C7-890C-0B3DBD7EED1A', -- Entity: MJ: Dogs
            18,
            'Description',
            'Description',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '13ab8f0a-c1c9-44ef-bfb7-f6139b38c8c7' OR (EntityID = '64B7852D-9CEF-40C7-890C-0B3DBD7EED1A' AND Name = 'PhotoBase64')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '13ab8f0a-c1c9-44ef-bfb7-f6139b38c8c7',
            '64B7852D-9CEF-40C7-890C-0B3DBD7EED1A', -- Entity: MJ: Dogs
            19,
            'PhotoBase64',
            'Photo Base 64',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4c731726-049f-4fb4-ae1b-690aec2ea342' OR (EntityID = '64B7852D-9CEF-40C7-890C-0B3DBD7EED1A' AND Name = 'HousingID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4c731726-049f-4fb4-ae1b-690aec2ea342',
            '64B7852D-9CEF-40C7-890C-0B3DBD7EED1A', -- Entity: MJ: Dogs
            20,
            'HousingID',
            'Housing ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7ae4423a-7e7e-45a4-a14f-d4b84b339169' OR (EntityID = '64B7852D-9CEF-40C7-890C-0B3DBD7EED1A' AND Name = 'IsGoodWithPeople')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7ae4423a-7e7e-45a4-a14f-d4b84b339169',
            '64B7852D-9CEF-40C7-890C-0B3DBD7EED1A', -- Entity: MJ: Dogs
            21,
            'IsGoodWithPeople',
            'Is Good With People',
            NULL,
            'bit',
            1,
            1,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '42ccffaf-e8d5-4200-9a7c-683881156da2' OR (EntityID = '64B7852D-9CEF-40C7-890C-0B3DBD7EED1A' AND Name = 'Notes')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '42ccffaf-e8d5-4200-9a7c-683881156da2',
            '64B7852D-9CEF-40C7-890C-0B3DBD7EED1A', -- Entity: MJ: Dogs
            22,
            'Notes',
            'Notes',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;
UPDATE [${flyway:defaultSchema}].[EntityField]
         SET [Sequence] = [Sequence] + 100000
       WHERE [EntityID] = 'A2425230-0F81-413B-B391-98D246E04020'
         AND [Sequence] < 100000;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7b39e51e-93e9-4835-933b-47304311ce24' OR (EntityID = 'A2425230-0F81-413B-B391-98D246E04020' AND Name = 'Animal')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7b39e51e-93e9-4835-933b-47304311ce24',
            'A2425230-0F81-413B-B391-98D246E04020', -- Entity: MJ: Adoptions
            12,
            'Animal',
            'Animal',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '19445a7c-a43a-4936-ab96-5450399d45d3' OR (EntityID = 'A2425230-0F81-413B-B391-98D246E04020' AND Name = 'Adopter')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '19445a7c-a43a-4936-ab96-5450399d45d3',
            'A2425230-0F81-413B-B391-98D246E04020', -- Entity: MJ: Adoptions
            13,
            'Adopter',
            'Adopter',
            NULL,
            'nvarchar',
            202,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;
UPDATE [${flyway:defaultSchema}].[EntityField]
         SET [Sequence] = [Sequence] + 100000
       WHERE [EntityID] = 'B7B001CB-8219-4CF9-B507-FF85D99A9F77'
         AND [Sequence] < 100000;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ca951f28-b7de-4810-84e2-0f013c98239a' OR (EntityID = 'B7B001CB-8219-4CF9-B507-FF85D99A9F77' AND Name = 'Name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ca951f28-b7de-4810-84e2-0f013c98239a',
            'B7B001CB-8219-4CF9-B507-FF85D99A9F77', -- Entity: MJ: Cats
            8,
            'Name',
            'Name',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            1,
            1,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dc675f16-0d39-4901-8c65-cbb51e1a8ec8' OR (EntityID = 'B7B001CB-8219-4CF9-B507-FF85D99A9F77' AND Name = 'Species')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'dc675f16-0d39-4901-8c65-cbb51e1a8ec8',
            'B7B001CB-8219-4CF9-B507-FF85D99A9F77', -- Entity: MJ: Cats
            9,
            'Species',
            'Species',
            NULL,
            'nvarchar',
            40,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1804e124-015f-4df6-b6fb-4bad8df154ee' OR (EntityID = 'B7B001CB-8219-4CF9-B507-FF85D99A9F77' AND Name = 'BreedID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1804e124-015f-4df6-b6fb-4bad8df154ee',
            'B7B001CB-8219-4CF9-B507-FF85D99A9F77', -- Entity: MJ: Cats
            10,
            'BreedID',
            'Breed ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8284fa86-ebe2-46c3-9224-b2ee0f5e4201' OR (EntityID = 'B7B001CB-8219-4CF9-B507-FF85D99A9F77' AND Name = 'MicrochipNumber')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8284fa86-ebe2-46c3-9224-b2ee0f5e4201',
            'B7B001CB-8219-4CF9-B507-FF85D99A9F77', -- Entity: MJ: Cats
            11,
            'MicrochipNumber',
            'Microchip Number',
            NULL,
            'nvarchar',
            60,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e002dc13-228f-4a40-a27a-2dad33dd5293' OR (EntityID = 'B7B001CB-8219-4CF9-B507-FF85D99A9F77' AND Name = 'IntakeDate')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e002dc13-228f-4a40-a27a-2dad33dd5293',
            'B7B001CB-8219-4CF9-B507-FF85D99A9F77', -- Entity: MJ: Cats
            12,
            'IntakeDate',
            'Intake Date',
            NULL,
            'date',
            3,
            10,
            0,
            0,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '00049403-9906-4732-8c2a-5c4290beb172' OR (EntityID = 'B7B001CB-8219-4CF9-B507-FF85D99A9F77' AND Name = 'IntakeReason')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '00049403-9906-4732-8c2a-5c4290beb172',
            'B7B001CB-8219-4CF9-B507-FF85D99A9F77', -- Entity: MJ: Cats
            13,
            'IntakeReason',
            'Intake Reason',
            NULL,
            'nvarchar',
            60,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'de0de6d4-3be5-4d1b-bc01-e12b4731cef3' OR (EntityID = 'B7B001CB-8219-4CF9-B507-FF85D99A9F77' AND Name = 'Sex')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'de0de6d4-3be5-4d1b-bc01-e12b4731cef3',
            'B7B001CB-8219-4CF9-B507-FF85D99A9F77', -- Entity: MJ: Cats
            14,
            'Sex',
            'Sex',
            NULL,
            'nvarchar',
            20,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '13913a65-acec-4d63-bb91-948da3876824' OR (EntityID = 'B7B001CB-8219-4CF9-B507-FF85D99A9F77' AND Name = 'EstimatedBirthDate')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '13913a65-acec-4d63-bb91-948da3876824',
            'B7B001CB-8219-4CF9-B507-FF85D99A9F77', -- Entity: MJ: Cats
            15,
            'EstimatedBirthDate',
            'Estimated Birth Date',
            NULL,
            'date',
            3,
            10,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1088d075-846e-4673-94a2-d4b5853fc838' OR (EntityID = 'B7B001CB-8219-4CF9-B507-FF85D99A9F77' AND Name = 'WeightKg')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1088d075-846e-4673-94a2-d4b5853fc838',
            'B7B001CB-8219-4CF9-B507-FF85D99A9F77', -- Entity: MJ: Cats
            16,
            'WeightKg',
            'Weight Kg',
            NULL,
            'decimal',
            5,
            6,
            2,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd63d63da-20f0-4170-a509-07172ce46de3' OR (EntityID = 'B7B001CB-8219-4CF9-B507-FF85D99A9F77' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd63d63da-20f0-4170-a509-07172ce46de3',
            'B7B001CB-8219-4CF9-B507-FF85D99A9F77', -- Entity: MJ: Cats
            17,
            'Status',
            'Status',
            NULL,
            'nvarchar',
            40,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9715deee-975a-401f-8e8b-d9f0209e6e1c' OR (EntityID = 'B7B001CB-8219-4CF9-B507-FF85D99A9F77' AND Name = 'Description')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9715deee-975a-401f-8e8b-d9f0209e6e1c',
            'B7B001CB-8219-4CF9-B507-FF85D99A9F77', -- Entity: MJ: Cats
            18,
            'Description',
            'Description',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b8216e75-ddaa-4049-b5b6-c497a37721e0' OR (EntityID = 'B7B001CB-8219-4CF9-B507-FF85D99A9F77' AND Name = 'PhotoBase64')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b8216e75-ddaa-4049-b5b6-c497a37721e0',
            'B7B001CB-8219-4CF9-B507-FF85D99A9F77', -- Entity: MJ: Cats
            19,
            'PhotoBase64',
            'Photo Base 64',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '74f77917-a3f6-4aae-a539-fca2c0135a77' OR (EntityID = 'B7B001CB-8219-4CF9-B507-FF85D99A9F77' AND Name = 'HousingID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '74f77917-a3f6-4aae-a539-fca2c0135a77',
            'B7B001CB-8219-4CF9-B507-FF85D99A9F77', -- Entity: MJ: Cats
            20,
            'HousingID',
            'Housing ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3dbeb427-6368-4bd1-b6b4-ab1ef5c0831e' OR (EntityID = 'B7B001CB-8219-4CF9-B507-FF85D99A9F77' AND Name = 'IsGoodWithPeople')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3dbeb427-6368-4bd1-b6b4-ab1ef5c0831e',
            'B7B001CB-8219-4CF9-B507-FF85D99A9F77', -- Entity: MJ: Cats
            21,
            'IsGoodWithPeople',
            'Is Good With People',
            NULL,
            'bit',
            1,
            1,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e4e09e0d-449e-438d-9c77-0732fdb74ad0' OR (EntityID = 'B7B001CB-8219-4CF9-B507-FF85D99A9F77' AND Name = 'Notes')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e4e09e0d-449e-438d-9c77-0732fdb74ad0',
            'B7B001CB-8219-4CF9-B507-FF85D99A9F77', -- Entity: MJ: Cats
            22,
            'Notes',
            'Notes',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* Update IS-A parent field Name on MJ: Cats */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='nvarchar',
                      [Length]=200,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=0,
                      [AllowUpdateAPI]=1
                  WHERE [ID]='CA951F28-B7DE-4810-84E2-0F013C98239A';

/* Update IS-A parent field Species on MJ: Cats */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='nvarchar',
                      [Length]=40,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=0,
                      [AllowUpdateAPI]=1
                  WHERE [ID]='DC675F16-0D39-4901-8C65-CBB51E1A8EC8';

/* Update IS-A parent field BreedID on MJ: Cats */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='uniqueidentifier',
                      [Length]=16,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1
                  WHERE [ID]='1804E124-015F-4DF6-B6FB-4BAD8DF154EE';

/* Update IS-A parent field MicrochipNumber on MJ: Cats */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='nvarchar',
                      [Length]=60,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1
                  WHERE [ID]='8284FA86-EBE2-46C3-9224-B2EE0F5E4201';

/* Update IS-A parent field IntakeDate on MJ: Cats */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='date',
                      [Length]=3,
                      [Precision]=10,
                      [Scale]=0,
                      [AllowsNull]=0,
                      [AllowUpdateAPI]=1
                  WHERE [ID]='E002DC13-228F-4A40-A27A-2DAD33DD5293';

/* Update IS-A parent field IntakeReason on MJ: Cats */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='nvarchar',
                      [Length]=60,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1
                  WHERE [ID]='00049403-9906-4732-8C2A-5C4290BEB172';

/* Update IS-A parent field Sex on MJ: Cats */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='nvarchar',
                      [Length]=20,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1
                  WHERE [ID]='DE0DE6D4-3BE5-4D1B-BC01-E12B4731CEF3';

/* Update IS-A parent field EstimatedBirthDate on MJ: Cats */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='date',
                      [Length]=3,
                      [Precision]=10,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1
                  WHERE [ID]='13913A65-ACEC-4D63-BB91-948DA3876824';

/* Update IS-A parent field WeightKg on MJ: Cats */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='decimal',
                      [Length]=5,
                      [Precision]=6,
                      [Scale]=2,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1
                  WHERE [ID]='1088D075-846E-4673-94A2-D4B5853FC838';

/* Update IS-A parent field Status on MJ: Cats */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='nvarchar',
                      [Length]=40,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=0,
                      [AllowUpdateAPI]=1
                  WHERE [ID]='D63D63DA-20F0-4170-A509-07172CE46DE3';

/* Update IS-A parent field Description on MJ: Cats */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='nvarchar',
                      [Length]=-1,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1
                  WHERE [ID]='9715DEEE-975A-401F-8E8B-D9F0209E6E1C';

/* Update IS-A parent field PhotoBase64 on MJ: Cats */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='nvarchar',
                      [Length]=-1,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1
                  WHERE [ID]='B8216E75-DDAA-4049-B5B6-C497A37721E0';

/* Update IS-A parent field HousingID on MJ: Cats */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='uniqueidentifier',
                      [Length]=16,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1
                  WHERE [ID]='74F77917-A3F6-4AAE-A539-FCA2C0135A77';

/* Update IS-A parent field IsGoodWithPeople on MJ: Cats */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='bit',
                      [Length]=1,
                      [Precision]=1,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1
                  WHERE [ID]='3DBEB427-6368-4BD1-B6B4-AB1EF5C0831E';

/* Update IS-A parent field Notes on MJ: Cats */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='nvarchar',
                      [Length]=-1,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1
                  WHERE [ID]='E4E09E0D-449E-438D-9C77-0732FDB74AD0';

/* Update entity timestamp for MJ: Cats after IS-A field sync */
UPDATE [${flyway:defaultSchema}].[Entity] SET [__mj_UpdatedAt]=GETUTCDATE() WHERE ID='B7B001CB-8219-4CF9-B507-FF85D99A9F77';

/* Update IS-A parent field Name on MJ: Dogs */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='nvarchar',
                      [Length]=200,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=0,
                      [AllowUpdateAPI]=1
                  WHERE [ID]='D228E4D1-5EFC-448E-9892-39AA22CE74AE';

/* Update IS-A parent field Species on MJ: Dogs */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='nvarchar',
                      [Length]=40,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=0,
                      [AllowUpdateAPI]=1
                  WHERE [ID]='790AFD67-ACA7-49AA-9665-3C6ECFD4A531';

/* Update IS-A parent field BreedID on MJ: Dogs */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='uniqueidentifier',
                      [Length]=16,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1
                  WHERE [ID]='E6148679-7C93-481C-8919-29386C0282C7';

/* Update IS-A parent field MicrochipNumber on MJ: Dogs */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='nvarchar',
                      [Length]=60,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1
                  WHERE [ID]='C1BE5FF6-C95D-44D6-B1FF-79F203B4F13A';

/* Update IS-A parent field IntakeDate on MJ: Dogs */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='date',
                      [Length]=3,
                      [Precision]=10,
                      [Scale]=0,
                      [AllowsNull]=0,
                      [AllowUpdateAPI]=1
                  WHERE [ID]='B38F04F4-2CE4-4C8E-9BDE-82BEAC063F80';

/* Update IS-A parent field IntakeReason on MJ: Dogs */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='nvarchar',
                      [Length]=60,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1
                  WHERE [ID]='956B6876-B1DF-434B-BB3F-08379CC319D9';

/* Update IS-A parent field Sex on MJ: Dogs */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='nvarchar',
                      [Length]=20,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1
                  WHERE [ID]='D68872AF-4396-4078-AC98-316F6104D3F0';

/* Update IS-A parent field EstimatedBirthDate on MJ: Dogs */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='date',
                      [Length]=3,
                      [Precision]=10,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1
                  WHERE [ID]='4B860356-4E0D-42F8-A163-412A22880481';

/* Update IS-A parent field WeightKg on MJ: Dogs */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='decimal',
                      [Length]=5,
                      [Precision]=6,
                      [Scale]=2,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1
                  WHERE [ID]='233F7FD5-53D0-419A-BC20-E2F0A0983AA1';

/* Update IS-A parent field Status on MJ: Dogs */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='nvarchar',
                      [Length]=40,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=0,
                      [AllowUpdateAPI]=1
                  WHERE [ID]='242FBA43-D53D-43B6-8758-440E0EB06558';

/* Update IS-A parent field Description on MJ: Dogs */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='nvarchar',
                      [Length]=-1,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1
                  WHERE [ID]='B8806E0C-95EC-4389-B941-0E1A93204042';

/* Update IS-A parent field PhotoBase64 on MJ: Dogs */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='nvarchar',
                      [Length]=-1,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1
                  WHERE [ID]='13AB8F0A-C1C9-44EF-BFB7-F6139B38C8C7';

/* Update IS-A parent field HousingID on MJ: Dogs */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='uniqueidentifier',
                      [Length]=16,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1
                  WHERE [ID]='4C731726-049F-4FB4-AE1B-690AEC2EA342';

/* Update IS-A parent field IsGoodWithPeople on MJ: Dogs */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='bit',
                      [Length]=1,
                      [Precision]=1,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1
                  WHERE [ID]='7AE4423A-7E7E-45A4-A14F-D4B84B339169';

/* Update IS-A parent field Notes on MJ: Dogs */
UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='nvarchar',
                      [Length]=-1,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1
                  WHERE [ID]='42CCFFAF-E8D5-4200-9A7C-683881156DA2';

/* Update entity timestamp for MJ: Dogs after IS-A field sync */
UPDATE [${flyway:defaultSchema}].[Entity] SET [__mj_UpdatedAt]=GETUTCDATE() WHERE ID='64B7852D-9CEF-40C7-890C-0B3DBD7EED1A';

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'BC1D1033-106E-46A3-8159-F417AA77E5E3'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '49589AB3-263D-479E-831E-85181FD07CC0'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'B49A6218-6B8F-45CA-A49D-9D35CEABF898'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '7B39E51E-93E9-4835-933B-47304311CE24'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '19445A7C-A43A-4936-AB96-5450399D45D3'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '7B39E51E-93E9-4835-933B-47304311CE24'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '19445A7C-A43A-4936-AB96-5450399D45D3'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '7B39E51E-93E9-4835-933B-47304311CE24'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '19445A7C-A43A-4936-AB96-5450399D45D3'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '1D9F8278-37C4-4D16-9AC3-DB62C67B5532'
               AND AutoUpdateIsNameField = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 0
               WHERE ID = '7A66CF35-F3E1-4815-9566-539E864B193E'
               AND AutoUpdateIsNameField = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '7A1AE5CE-0037-4320-AB1D-3752D9FC1344'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '34575F75-7166-480E-8FF3-43B0CFA21422'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '1090B685-05DF-4E1D-A01B-06BB5A844D37'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '1D9F8278-37C4-4D16-9AC3-DB62C67B5532'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '8088A3CD-301E-40A9-8B40-83DA62093C46'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '7A1AE5CE-0037-4320-AB1D-3752D9FC1344'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '1D9F8278-37C4-4D16-9AC3-DB62C67B5532'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '8088A3CD-301E-40A9-8B40-83DA62093C46'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '7A1AE5CE-0037-4320-AB1D-3752D9FC1344'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '168AFFEB-5FE7-4851-BC15-741EAFFFEB5F'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'E002DC13-228F-4A40-A27A-2DAD33DD5293'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'DE0DE6D4-3BE5-4D1B-BC01-E12B4731CEF3'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'D63D63DA-20F0-4170-A509-07172CE46DE3'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '8284FA86-EBE2-46C3-9224-B2EE0F5E4201'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'CA951F28-B7DE-4810-84E2-0F013C98239A'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '8284FA86-EBE2-46C3-9224-B2EE0F5E4201'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '2763736A-FE7E-4369-B35C-C5EB832BA837'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'B38F04F4-2CE4-4C8E-9BDE-82BEAC063F80'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'D68872AF-4396-4078-AC98-316F6104D3F0'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '242FBA43-D53D-43B6-8758-440E0EB06558'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'C1BE5FF6-C95D-44D6-B1FF-79F203B4F13A'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'D228E4D1-5EFC-448E-9892-39AA22CE74AE'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = 'C1BE5FF6-C95D-44D6-B1FF-79F203B4F13A'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set categories for 13 fields */

-- UPDATE Entity Field Category Info MJ: Adoptions.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '277E3BEC-755B-44C9-AA64-89685A65B881' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Adoptions.AnimalID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Adoption Participants',
   GeneratedFormSection = 'Category',
   DisplayName = 'Animal',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9A4E3621-9E87-4F68-900E-DB9AB2BBB840' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Adoptions.AdopterID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Adoption Participants',
   GeneratedFormSection = 'Category',
   DisplayName = 'Adopter',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F0E33B04-5F78-42BF-8F1C-495C735EBA21' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Adoptions.Animal 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Adoption Participants',
   GeneratedFormSection = 'Category',
   DisplayName = 'Animal Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7B39E51E-93E9-4835-933B-47304311CE24' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Adoptions.Adopter 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Adoption Participants',
   GeneratedFormSection = 'Category',
   DisplayName = 'Adopter Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '19445A7C-A43A-4936-AB96-5450399D45D3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Adoptions.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Adoption Workflow',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BC1D1033-106E-46A3-8159-F417AA77E5E3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Adoptions.InquiryDate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Adoption Workflow',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '49589AB3-263D-479E-831E-85181FD07CC0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Adoptions.CompletedDate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Adoption Workflow',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F7671ECD-744F-4EC2-92D6-80FE232DC991' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Adoptions.DenialReason 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Adoption Workflow',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '764179A8-B8B9-41E8-A490-54347DF97391' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Adoptions.Fee 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Financial Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Adoption Fee',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B49A6218-6B8F-45CA-A49D-9D35CEABF898' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Adoptions.Notes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Adoption Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8F3D8155-4072-4FB3-B1AD-2F1EA660BD4F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Adoptions.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F28DFE35-3833-42D6-96FD-1261D826770E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Adoptions.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CC1ABBA4-9D7B-4390-BA4C-1EA022EBD3DD' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-paw */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-paw', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'A2425230-0F81-413B-B391-98D246E04020';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('5fcb2030-2a17-402d-b4f6-ec90710e1746', 'A2425230-0F81-413B-B391-98D246E04020', 'FieldCategoryInfo', '{"Adoption Participants":{"icon":"fa fa-users","description":"References and names of the animal and family involved in the adoption"},"Adoption Workflow":{"icon":"fa fa-tasks","description":"Status tracking, key dates, and process outcomes"},"Financial Details":{"icon":"fa fa-dollar-sign","description":"Pricing and transaction information for the adoption"},"Adoption Details":{"icon":"fa fa-align-left","description":"Additional context and notes regarding the adoption inquiry"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('4c06d687-28a6-4721-b207-b9caec195cb5', 'A2425230-0F81-413B-B391-98D246E04020', 'FieldCategoryIcons', '{"Adoption Participants":"fa fa-users","Adoption Workflow":"fa fa-tasks","Financial Details":"fa fa-dollar-sign","Adoption Details":"fa fa-align-left","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'A2425230-0F81-413B-B391-98D246E04020';

/* Set categories for 12 fields */

-- UPDATE Entity Field Category Info MJ: Adopters.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9F748B4D-FE7D-49BA-947A-A0AC9EAF6ABB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Adopters.FirstName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Personal Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1D9F8278-37C4-4D16-9AC3-DB62C67B5532' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Adopters.LastName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Personal Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8088A3CD-301E-40A9-8B40-83DA62093C46' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Adopters.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Personal Information',
   GeneratedFormSection = 'Category',
   DisplayName = 'Full Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7A66CF35-F3E1-4815-9566-539E864B193E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Adopters.Email 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Personal Information',
   GeneratedFormSection = 'Category',
   DisplayName = 'Email Address',
   ExtendedType = 'Email',
   CodeType = NULL
WHERE 
   ID = '7A1AE5CE-0037-4320-AB1D-3752D9FC1344' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Adopters.HousingType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Home and Lifestyle',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D751242C-ADA4-4BE1-B42B-BAA285679F49' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Adopters.HasYard 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Home and Lifestyle',
   GeneratedFormSection = 'Category',
   DisplayName = 'Has Enclosed Yard',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DC283C4F-D13B-4147-B30B-C7F798AABA2D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Adopters.HasOtherPets 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Home and Lifestyle',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1F2422C2-B44B-4BCD-87D1-ED5B79174531' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Adopters.IsApproved 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Status and Screening',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '34575F75-7166-480E-8FF3-43B0CFA21422' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Adopters.IsActive 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Status and Screening',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1090B685-05DF-4E1D-A01B-06BB5A844D37' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Adopters.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0A974127-E3A9-420B-A8C1-345403226E32' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Adopters.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0E8D8C0D-9DAD-45AE-90BD-58CE7BDC5357' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-user-friends */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-user-friends', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '279F206B-822B-41BA-97B6-3BC705DB55AB';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('20de990b-3154-46b7-a41d-c83917e478a0', '279F206B-822B-41BA-97B6-3BC705DB55AB', 'FieldCategoryInfo', '{"Personal Information":{"icon":"fa fa-user","description":"Core contact and identity information for the adopter"},"Home and Lifestyle":{"icon":"fa fa-home","description":"Home environment details and household pet status"},"Status and Screening":{"icon":"fa fa-check-circle","description":"Adopter approval status and account activity state"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('bc20b81f-fc0a-4a17-b550-da586689b62a', '279F206B-822B-41BA-97B6-3BC705DB55AB', 'FieldCategoryIcons', '{"Personal Information":"fa fa-user","Home and Lifestyle":"fa fa-home","Status and Screening":"fa fa-check-circle","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '279F206B-822B-41BA-97B6-3BC705DB55AB';

/* Set categories for 20 fields */

-- UPDATE Entity Field Category Info MJ: Animals.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7556A7F6-61EE-4C02-B410-D0DE79C4D61B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5F1C007E-9158-4FDA-B394-E4720CE1DC0D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6C4C487E-6616-43A0-B731-E02749033E17' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C755A802-FA0C-4100-9795-93FBB9A09CAD' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.Species 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '14AF4223-9395-490A-9379-15CDB9D03097' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.BreedID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Breed',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B296835D-7A50-4208-9671-0EAAC207F239' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.Breed 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Breed Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A2FA8364-00BC-4B78-B404-B62FE5FBC819' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.MicrochipNumber 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '57A8EE40-9CD3-47EA-AFE0-937A5A5FCF7E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.IntakeDate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4992E657-62FC-4B60-8B44-AE19B2643091' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.IntakeReason 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '08050F3D-9B49-49D5-BCA2-8A416BC864ED' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C4C52249-5EB8-4886-8431-87E2F1D6D1A0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.HousingID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Housing Unit',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3C9EA97F-D1F7-4CBA-B037-F367E3520C70' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.Housing 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Housing Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3FDE852D-4F5F-424B-8E36-E64FEB8C0781' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.Sex 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '61F9A077-4288-4DDD-9E7D-101952BE8E0E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.EstimatedBirthDate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3379A4DB-A473-4FA1-AA5B-4FF5508781BE' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.WeightKg 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A26EE0EA-5B2E-4CDC-B458-64861B812713' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.IsGoodWithPeople 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Physical Attributes',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9B7AC55A-E87E-4F26-9BE2-BCC5915FA44F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5B541036-B1DB-4A16-8873-73E4A880E923' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.PhotoBase64 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7532C9F4-CEAB-44B0-80C1-218FE913C9BB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Animals.Notes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Animal Profile',
   GeneratedFormSection = 'Category',
   DisplayName = 'Staff Notes',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DE7BD5D6-F7D9-43D6-BCFB-5F50DADCC643' AND AutoUpdateCategory = 1;

/* Set categories for 22 fields */

-- UPDATE Entity Field Category Info MJ: Dogs.EnergyLevel 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Dog Behavioral Profile',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2763736A-FE7E-4369-B35C-C5EB832BA837' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Dogs.IsLeashTrained 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Dog Behavioral Profile',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E1382501-9CA1-4FA0-93F2-ADC5168FBF47' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Dogs.IsHouseTrained 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Dog Behavioral Profile',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C3F0314A-39BB-40AF-A456-F0998F2AEF9C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Dogs.IsGoodWithDogs 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Dog Behavioral Profile',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5A9401D5-9952-4798-9B66-47081BF20C78' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Dogs.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Animal Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A9EAE87C-2656-4EE3-B03E-8640EAF0F98D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Dogs.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Animal Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D228E4D1-5EFC-448E-9892-39AA22CE74AE' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Dogs.Species 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Animal Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '790AFD67-ACA7-49AA-9665-3C6ECFD4A531' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Dogs.BreedID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Animal Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Breed',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E6148679-7C93-481C-8919-29386C0282C7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Dogs.MicrochipNumber 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Animal Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C1BE5FF6-C95D-44D6-B1FF-79F203B4F13A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Dogs.IntakeDate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Animal Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B38F04F4-2CE4-4C8E-9BDE-82BEAC063F80' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Dogs.IntakeReason 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Animal Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '956B6876-B1DF-434B-BB3F-08379CC319D9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Dogs.Sex 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Animal Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D68872AF-4396-4078-AC98-316F6104D3F0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Dogs.EstimatedBirthDate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Animal Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4B860356-4E0D-42F8-A163-412A22880481' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Dogs.WeightKg 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Animal Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Weight (kg)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '233F7FD5-53D0-419A-BC20-E2F0A0983AA1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Dogs.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Animal Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '242FBA43-D53D-43B6-8758-440E0EB06558' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Dogs.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Animal Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B8806E0C-95EC-4389-B941-0E1A93204042' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Dogs.PhotoBase64 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Animal Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Photo',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '13AB8F0A-C1C9-44EF-BFB7-F6139B38C8C7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Dogs.HousingID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Animal Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Housing',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4C731726-049F-4FB4-AE1B-690AEC2EA342' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Dogs.IsGoodWithPeople 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Animal Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7AE4423A-7E7E-45A4-A14F-D4B84B339169' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Dogs.Notes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Animal Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '42CCFFAF-E8D5-4200-9A7C-683881156DA2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Dogs.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CEC90B04-CC90-4AD3-B917-3F203BE31301' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Dogs.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '61A84E6B-217C-4CAE-8CB2-3D713277FB8C' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-dog */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-dog', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '64B7852D-9CEF-40C7-890C-0B3DBD7EED1A';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('cc183f6c-e4ac-4a76-9666-e72396c353b0', '64B7852D-9CEF-40C7-890C-0B3DBD7EED1A', 'FieldCategoryInfo', '{"Dog Behavioral Profile":{"icon":"fa fa-paw","description":"Specific training and behavioral traits unique to dogs"},"Animal Details":{"icon":"fa fa-dog","description":"General animal information inherited from the Animal record","inheritedFromEntityName":"MJ: Animals","inheritedFromEntityID":"22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('4dc01e1d-9623-484e-9a0a-bb60eeadbe81', '64B7852D-9CEF-40C7-890C-0B3DBD7EED1A', 'FieldCategoryIcons', '{"Dog Behavioral Profile":"fa fa-paw","Animal Details":"fa fa-dog","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '64B7852D-9CEF-40C7-890C-0B3DBD7EED1A';

/* Set categories for 22 fields */

-- UPDATE Entity Field Category Info MJ: Cats.IsIndoorOnly 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Feline Behavioral Traits',
   GeneratedFormSection = 'Category',
   DisplayName = 'Indoor Only',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '168AFFEB-5FE7-4851-BC15-741EAFFFEB5F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Cats.IsDeclawed 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Feline Behavioral Traits',
   GeneratedFormSection = 'Category',
   DisplayName = 'Declawed',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '55E97FFF-BDA8-47C2-88A0-0676AE4668EE' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Cats.IsLitterTrained 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Feline Behavioral Traits',
   GeneratedFormSection = 'Category',
   DisplayName = 'Litter Trained',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '264F9A8E-3046-4C8D-BC36-92A2230ED459' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Cats.IsGoodWithCats 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Feline Behavioral Traits',
   GeneratedFormSection = 'Category',
   DisplayName = 'Good With Cats',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '447CBA45-7DC8-42A9-980F-600D4034252D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Cats.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Animal Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A25213E4-D9FC-4DCD-8143-364EE242A372' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Cats.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Animal Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CA951F28-B7DE-4810-84E2-0F013C98239A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Cats.Species 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Animal Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DC675F16-0D39-4901-8C65-CBB51E1A8EC8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Cats.BreedID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Animal Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Breed',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1804E124-015F-4DF6-B6FB-4BAD8DF154EE' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Cats.MicrochipNumber 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Animal Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8284FA86-EBE2-46C3-9224-B2EE0F5E4201' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Cats.IntakeDate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Animal Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E002DC13-228F-4A40-A27A-2DAD33DD5293' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Cats.IntakeReason 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Animal Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '00049403-9906-4732-8C2A-5C4290BEB172' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Cats.Sex 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Animal Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DE0DE6D4-3BE5-4D1B-BC01-E12B4731CEF3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Cats.EstimatedBirthDate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Animal Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '13913A65-ACEC-4D63-BB91-948DA3876824' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Cats.WeightKg 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Animal Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Weight (kg)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1088D075-846E-4673-94A2-D4B5853FC838' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Cats.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Animal Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D63D63DA-20F0-4170-A509-07172CE46DE3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Cats.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Animal Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9715DEEE-975A-401F-8E8B-D9F0209E6E1C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Cats.PhotoBase64 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Animal Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Photo',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B8216E75-DDAA-4049-B5B6-C497A37721E0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Cats.HousingID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Animal Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Housing',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '74F77917-A3F6-4AAE-A539-FCA2C0135A77' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Cats.IsGoodWithPeople 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Animal Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Good With People',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3DBEB427-6368-4BD1-B6B4-AB1EF5C0831E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Cats.Notes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Animal Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E4E09E0D-449E-438D-9C77-0732FDB74AD0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Cats.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CF8CA7D6-CD4B-4570-8CFB-B0B7B03D8234' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Cats.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F8A46ACF-4929-4FFF-8864-2FF5F257747D' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-cat */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-cat', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'B7B001CB-8219-4CF9-B507-FF85D99A9F77';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('675a3f80-4b76-4a4e-89d6-bef975995d5a', 'B7B001CB-8219-4CF9-B507-FF85D99A9F77', 'FieldCategoryInfo', '{"Feline Behavioral Traits":{"icon":"fa fa-cat","description":"Specific behavioral and health traits unique to cats."},"Animal Details":{"icon":"fa fa-paw","description":"General animal information inherited from the base record.","inheritedFromEntityName":"MJ: Animals","inheritedFromEntityID":"22E4F4DE-9A9B-4FE3-AB1A-ECAC7EF5EF9D"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields."}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('1f1af7bb-b635-4311-b222-775638fa55f0', 'B7B001CB-8219-4CF9-B507-FF85D99A9F77', 'FieldCategoryIcons', '{"Feline Behavioral Traits":"fa fa-cat","Animal Details":"fa fa-paw","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'B7B001CB-8219-4CF9-B507-FF85D99A9F77';

/* Generated Validation Functions for MJ: Adoptions */
-- CHECK constraint for MJ: Adoptions: Field: Fee was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([Fee] IS NULL OR [Fee]>=(0))', 'public ValidateFeeIsNonNegative(result: ValidationResult) {
	if (this.Fee != null && this.Fee < 0) {
		result.Errors.push(new ValidationErrorInfo(
			"Fee",
			"The fee must be greater than or equal to 0.",
			this.Fee,
			ValidationErrorType.Failure
		));
	}
}', 'The adoption fee must be greater than or equal to zero. Negative fees are not allowed.', 'ValidateFeeIsNonNegative', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'B49A6218-6B8F-45CA-A49D-9D35CEABF898');

            -- CHECK constraint for MJ: Adoptions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([CompletedDate] IS NULL OR [CompletedDate]>=[InquiryDate])', 'public ValidateCompletedDateAfterInquiryDate(result: ValidationResult) {
	if (this.CompletedDate != null && this.InquiryDate != null) {
		const completed = new Date(this.CompletedDate);
		const inquiry = new Date(this.InquiryDate);
		if (completed < inquiry) {
			result.Errors.push(new ValidationErrorInfo(
				"CompletedDate",
				"The completed date cannot be earlier than the inquiry date.",
				this.CompletedDate,
				ValidationErrorType.Failure
			));
		}
	}
}', 'The completed date of an inquiry must be on or after the date the inquiry was made.', 'ValidateCompletedDateAfterInquiryDate', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'A2425230-0F81-413B-B391-98D246E04020');

            -- CHECK constraint for MJ: Adoptions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([Status]<>''Completed'' OR [CompletedDate] IS NOT NULL)', 'public ValidateCompletedDateWhenStatusIsCompleted(result: ValidationResult) {
	if (this.Status === "Completed" && this.CompletedDate == null) {
		result.Errors.push(new ValidationErrorInfo(
			"CompletedDate",
			"A Completed Date must be provided when the status is set to ''Completed''.",
			this.CompletedDate,
			ValidationErrorType.Failure
		));
	}
}', 'If the status is set to ''Completed'', a completed date must be provided to ensure accurate tracking of when the process was finalized.', 'ValidateCompletedDateWhenStatusIsCompleted', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'A2425230-0F81-413B-B391-98D246E04020');

            -- CHECK constraint for MJ: Adoptions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([Status]<>''Denied'' OR [DenialReason] IS NOT NULL)', 'public ValidateDenialReasonForDeniedStatus(result: ValidationResult) {
	if (this.Status === "Denied" && (this.DenialReason === null || this.DenialReason === undefined || this.DenialReason.trim() === "")) {
		result.Errors.push(new ValidationErrorInfo(
			"DenialReason",
			"A denial reason must be provided when the status is set to Denied.",
			this.DenialReason,
			ValidationErrorType.Failure
		));
	}
}', 'If an application status is set to ''Denied'', a denial reason must be provided to explain why the application was rejected.', 'ValidateDenialReasonForDeniedStatus', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'A2425230-0F81-413B-B391-98D246E04020');


/* ---------------------------------------------------------------------------------------------
   CAPTURE 2 of 2 -- second run, after `mj sync push` declared the related-record
   collections. Rebuilds vwAdoptions and its CRUD procs so the display fields created in pass 1
   appear in the view. No field inserts here: everything metadata-level settled in pass 1.
   --------------------------------------------------------------------------------------------- */

/* Base View SQL for MJ: Adoptions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Adoptions
-- Item: vwAdoptions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Adoptions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Adoption
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAdoptions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAdoptions];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAdoptions]
AS
SELECT
    a.*,
    MJAnimal_AnimalID.[Name] AS [Animal],
    MJAdopter_AdopterID.[FirstName] AS [Adopter]
FROM
    [${flyway:defaultSchema}].[Adoption] AS a
INNER JOIN
    [${flyway:defaultSchema}].[Animal] AS MJAnimal_AnimalID
  ON
    [a].[AnimalID] = MJAnimal_AnimalID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Adopter] AS MJAdopter_AdopterID
  ON
    [a].[AdopterID] = MJAdopter_AdopterID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAdoptions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Adoptions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Adoptions
-- Item: Permissions for vwAdoptions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAdoptions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Adoptions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Adoptions
-- Item: spCreateAdoption
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Adoption
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAdoption]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAdoption];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAdoption]
    @ID uniqueidentifier = NULL,
    @AnimalID uniqueidentifier,
    @AdopterID uniqueidentifier,
    @Status nvarchar(20) = NULL,
    @InquiryDate date,
    @CompletedDate_Clear bit = 0,
    @CompletedDate date = NULL,
    @Fee_Clear bit = 0,
    @Fee decimal(18, 2) = NULL,
    @DenialReason_Clear bit = 0,
    @DenialReason nvarchar(500) = NULL,
    @Notes_Clear bit = 0,
    @Notes nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Adoption]
            (
                [ID],
                [AnimalID],
                [AdopterID],
                [Status],
                [InquiryDate],
                [CompletedDate],
                [Fee],
                [DenialReason],
                [Notes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @AnimalID,
                @AdopterID,
                ISNULL(@Status, 'Inquiry'),
                @InquiryDate,
                CASE WHEN @CompletedDate_Clear = 1 THEN NULL ELSE ISNULL(@CompletedDate, NULL) END,
                CASE WHEN @Fee_Clear = 1 THEN NULL ELSE ISNULL(@Fee, NULL) END,
                CASE WHEN @DenialReason_Clear = 1 THEN NULL ELSE ISNULL(@DenialReason, NULL) END,
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Adoption]
            (
                [AnimalID],
                [AdopterID],
                [Status],
                [InquiryDate],
                [CompletedDate],
                [Fee],
                [DenialReason],
                [Notes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @AnimalID,
                @AdopterID,
                ISNULL(@Status, 'Inquiry'),
                @InquiryDate,
                CASE WHEN @CompletedDate_Clear = 1 THEN NULL ELSE ISNULL(@CompletedDate, NULL) END,
                CASE WHEN @Fee_Clear = 1 THEN NULL ELSE ISNULL(@Fee, NULL) END,
                CASE WHEN @DenialReason_Clear = 1 THEN NULL ELSE ISNULL(@DenialReason, NULL) END,
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAdoptions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAdoption] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Adoptions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAdoption] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Adoptions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Adoptions
-- Item: spUpdateAdoption
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Adoption
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAdoption]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAdoption];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAdoption]
    @ID uniqueidentifier,
    @AnimalID uniqueidentifier = NULL,
    @AdopterID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @InquiryDate date = NULL,
    @CompletedDate_Clear bit = 0,
    @CompletedDate date = NULL,
    @Fee_Clear bit = 0,
    @Fee decimal(18, 2) = NULL,
    @DenialReason_Clear bit = 0,
    @DenialReason nvarchar(500) = NULL,
    @Notes_Clear bit = 0,
    @Notes nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Adoption]
    SET
        [AnimalID] = ISNULL(@AnimalID, [AnimalID]),
        [AdopterID] = ISNULL(@AdopterID, [AdopterID]),
        [Status] = ISNULL(@Status, [Status]),
        [InquiryDate] = ISNULL(@InquiryDate, [InquiryDate]),
        [CompletedDate] = CASE WHEN @CompletedDate_Clear = 1 THEN NULL ELSE ISNULL(@CompletedDate, [CompletedDate]) END,
        [Fee] = CASE WHEN @Fee_Clear = 1 THEN NULL ELSE ISNULL(@Fee, [Fee]) END,
        [DenialReason] = CASE WHEN @DenialReason_Clear = 1 THEN NULL ELSE ISNULL(@DenialReason, [DenialReason]) END,
        [Notes] = CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, [Notes]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAdoptions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAdoptions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAdoption] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Adoption table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAdoption]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAdoption];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAdoption
ON [${flyway:defaultSchema}].[Adoption]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Adoption]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Adoption] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Adoptions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAdoption] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Adoptions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Adoptions
-- Item: spDeleteAdoption
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Adoption
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAdoption]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAdoption];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAdoption]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Adoption]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAdoption] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Adoptions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAdoption] TO [cdp_Developer], [cdp_Integration];
