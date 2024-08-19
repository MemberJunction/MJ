/********************************************************************************
 List Details modifications
*********************************************************************************/
-- Adding Status column with description
ALTER TABLE ${flyway:defaultSchema}.ListDetail
ADD Status NVARCHAR(30) NOT NULL DEFAULT 'Pending'
CHECK (Status IN ('Pending','Active','Disabled','Rejected','Complete','Error','Other'));

-- Adding MS_DESCRIPTION for Status column
EXEC sys.sp_addextendedproperty
@name = N'MS_Description',
@value = N'Tracks the status of each individual list detail row to enable processing of various types and the use of the status column for filtering list detail rows within a list that are in a particular state.',
@level0type = N'SCHEMA', @level0name = ${flyway:defaultSchema},
@level1type = N'TABLE',  @level1name = ListDetail,
@level2type = N'COLUMN', @level2name = Status;

-- Adding AdditionalData column with description
ALTER TABLE ${flyway:defaultSchema}.ListDetail
ADD AdditionalData NVARCHAR(MAX) NULL;

-- Adding MS_DESCRIPTION for AdditionalData column
EXEC sys.sp_addextendedproperty
@name = N'MS_Description',
@value = N'Optional column that allows for tracking any additional data for each ListDetail row',
@level0type = N'SCHEMA', @level0name = ${flyway:defaultSchema},
@level1type = N'TABLE',  @level1name = ListDetail,
@level2type = N'COLUMN', @level2name = AdditionalData;


/********************************************************************************
 AI Models Stuff
*********************************************************************************/
-- Adding SpeedRank column with description
ALTER TABLE ${flyway:defaultSchema}.AIModel
ADD SpeedRank INT NULL DEFAULT 0 CHECK (SpeedRank >= 0);

-- Adding MS_DESCRIPTION for SpeedRank column
EXEC sys.sp_addextendedproperty
@name = N'MS_Description',
@value = N'Optional column that ranks the speed of the AI model. Default is 0 and should be non-negative.',
@level0type = N'SCHEMA', @level0name = ${flyway:defaultSchema},
@level1type = N'TABLE',  @level1name = AIModel,
@level2type = N'COLUMN', @level2name = SpeedRank;

-- Adding CostRank column with description
ALTER TABLE ${flyway:defaultSchema}.AIModel
ADD CostRank INT NULL DEFAULT 0 CHECK (CostRank >= 0);

-- Adding MS_DESCRIPTION for CostRank column
EXEC sys.sp_addextendedproperty
@name = N'MS_Description',
@value = N'Optional column that ranks the cost of the AI model. Default is 0 and should be non-negative.',
@level0type = N'SCHEMA', @level0name = ${flyway:defaultSchema},
@level1type = N'TABLE',  @level1name = AIModel,
@level2type = N'COLUMN', @level2name = CostRank;

-- Modifying PowerRank column with default and check constraint
ALTER TABLE ${flyway:defaultSchema}.AIModel
DROP CONSTRAINT IF EXISTS CK_AITable_PowerRank;  -- Drop existing check constraint if any

ALTER TABLE ${flyway:defaultSchema}.AIModel
ADD CONSTRAINT CK_AITable_PowerRank CHECK (PowerRank >= 0);

-- Adding default constraint for PowerRank
ALTER TABLE ${flyway:defaultSchema}.AIModel
ADD CONSTRAINT DF_AIModel_PowerRank DEFAULT 0 FOR PowerRank;

-- Conditionally removing existing MS_Description for PowerRank column
IF EXISTS (SELECT * FROM sys.extended_properties
           WHERE major_id = OBJECT_ID(N'${flyway:defaultSchema}.AIModel')
           AND minor_id = (SELECT column_id FROM sys.columns
                           WHERE object_id = OBJECT_ID(N'${flyway:defaultSchema}.AIModel')
                           AND name = 'PowerRank')
           AND name = N'MS_Description')
BEGIN
    EXEC sys.sp_dropextendedproperty
    @name = N'MS_Description',
    @level0type = N'SCHEMA', @level0name = ${flyway:defaultSchema},
    @level1type = N'TABLE',  @level1name = AIModel,
    @level2type = N'COLUMN', @level2name = PowerRank;
END;

-- Adding MS_DESCRIPTION for PowerRank column
EXEC sys.sp_addextendedproperty
@name = N'MS_Description',
@value = N'Optional column that ranks the power of the AI model. Default is 0 and should be non-negative.',
@level0type = N'SCHEMA', @level0name = ${flyway:defaultSchema},
@level1type = N'TABLE',  @level1name = AIModel,
@level2type = N'COLUMN', @level2name = PowerRank;
