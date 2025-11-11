-- Database Documentation Script
-- Generated: 2025-11-09T04:48:51.468Z
-- Database: LousyDB
-- Server: localhost

-- This script adds MS_Description extended properties to database objects


-- Schema: inv

-- Table: inv.adj
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'inv'
    AND t.name = 'adj'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'adj';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The inv.adj table records inventory adjustments, capturing changes to product quantities at specific warehouses on given dates, along with the reason, user responsible, and optional notes.',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'adj';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'adj'
    AND c.name = 'adj_id'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'adj',
        @level2type = N'COLUMN',
        @level2name = N'adj_id';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Surrogate primary key for each inventory adjustment record',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'adj',
    @level2type = N'COLUMN',
    @level2name = N'adj_id';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'adj'
    AND c.name = 'prd_id'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'adj',
        @level2type = N'COLUMN',
        @level2name = N'prd_id';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Identifier of the product whose inventory is being adjusted',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'adj',
    @level2type = N'COLUMN',
    @level2name = N'prd_id';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'adj'
    AND c.name = 'whs_id'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'adj',
        @level2type = N'COLUMN',
        @level2name = N'whs_id';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Identifier of the warehouse where the adjustment occurs',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'adj',
    @level2type = N'COLUMN',
    @level2name = N'whs_id';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'adj'
    AND c.name = 'adj_dt'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'adj',
        @level2type = N'COLUMN',
        @level2name = N'adj_dt';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the adjustment was recorded',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'adj',
    @level2type = N'COLUMN',
    @level2name = N'adj_dt';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'adj'
    AND c.name = 'qty'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'adj',
        @level2type = N'COLUMN',
        @level2name = N'qty';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Quantity change; positive for additions, negative for deductions',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'adj',
    @level2type = N'COLUMN',
    @level2name = N'qty';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'adj'
    AND c.name = 'rsn'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'adj',
        @level2type = N'COLUMN',
        @level2name = N'rsn';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reason code for the adjustment (STL=stolen, EXP=expired, DAM=damaged, COR=correction)',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'adj',
    @level2type = N'COLUMN',
    @level2name = N'rsn';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'adj'
    AND c.name = 'usr'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'adj',
        @level2type = N'COLUMN',
        @level2name = N'usr';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Name of the user who performed the adjustment',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'adj',
    @level2type = N'COLUMN',
    @level2name = N'usr';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'adj'
    AND c.name = 'notes'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'adj',
        @level2type = N'COLUMN',
        @level2name = N'notes';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Free‑text comment describing the adjustment context',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'adj',
    @level2type = N'COLUMN',
    @level2name = N'notes';
GO

-- Table: inv.cat
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'inv'
    AND t.name = 'cat'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'cat';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'inv.cat stores inventory categories and sub‑categories in a two‑level hierarchy, defining each category''s name, description, level, parent relationship, and display order.',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'cat';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'cat'
    AND c.name = 'cat_id'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'cat',
        @level2type = N'COLUMN',
        @level2name = N'cat_id';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier for each category or sub‑category.',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'cat',
    @level2type = N'COLUMN',
    @level2name = N'cat_id';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'cat'
    AND c.name = 'prnt_id'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'cat',
        @level2type = N'COLUMN',
        @level2name = N'prnt_id';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to the parent category''s cat_id; null for top‑level categories.',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'cat',
    @level2type = N'COLUMN',
    @level2name = N'prnt_id';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'cat'
    AND c.name = 'nm'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'cat',
        @level2type = N'COLUMN',
        @level2name = N'nm';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Human‑readable name of the category (e.g., "Writing", "Printers").',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'cat',
    @level2type = N'COLUMN',
    @level2name = N'nm';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'cat'
    AND c.name = 'dsc'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'cat',
        @level2type = N'COLUMN',
        @level2name = N'dsc';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Longer description of the category''s purpose or contents.',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'cat',
    @level2type = N'COLUMN',
    @level2name = N'dsc';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'cat'
    AND c.name = 'lvl'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'cat',
        @level2type = N'COLUMN',
        @level2name = N'lvl';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Hierarchy level: 1 for root categories, 2 for sub‑categories.',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'cat',
    @level2type = N'COLUMN',
    @level2name = N'lvl';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'cat'
    AND c.name = 'seq'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'cat',
        @level2type = N'COLUMN',
        @level2name = N'seq';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Display order of categories within the same parent.',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'cat',
    @level2type = N'COLUMN',
    @level2name = N'seq';
GO

-- Table: inv.cnt
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'inv'
    AND t.name = 'cnt'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'cnt';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores physical inventory count records, capturing the expected system quantity versus the actual counted quantity for each product in each warehouse on a specific date, along with the variance and the user who performed the count.',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'cnt';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'cnt'
    AND c.name = 'cnt_id'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'cnt',
        @level2type = N'COLUMN',
        @level2name = N'cnt_id';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier for each inventory count record',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'cnt',
    @level2type = N'COLUMN',
    @level2name = N'cnt_id';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'cnt'
    AND c.name = 'whs_id'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'cnt',
        @level2type = N'COLUMN',
        @level2name = N'whs_id';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to the warehouse where the count was performed',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'cnt',
    @level2type = N'COLUMN',
    @level2name = N'whs_id';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'cnt'
    AND c.name = 'cnt_dt'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'cnt',
        @level2type = N'COLUMN',
        @level2name = N'cnt_dt';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date on which the inventory count took place',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'cnt',
    @level2type = N'COLUMN',
    @level2name = N'cnt_dt';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'cnt'
    AND c.name = 'prd_id'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'cnt',
        @level2type = N'COLUMN',
        @level2name = N'prd_id';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to the product being counted',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'cnt',
    @level2type = N'COLUMN',
    @level2name = N'prd_id';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'cnt'
    AND c.name = 'exp_qty'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'cnt',
        @level2type = N'COLUMN',
        @level2name = N'exp_qty';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'System‑recorded expected quantity for the product in the warehouse at count time',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'cnt',
    @level2type = N'COLUMN',
    @level2name = N'exp_qty';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'cnt'
    AND c.name = 'act_qty'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'cnt',
        @level2type = N'COLUMN',
        @level2name = N'act_qty';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Quantity actually counted by the user',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'cnt',
    @level2type = N'COLUMN',
    @level2name = N'act_qty';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'cnt'
    AND c.name = 'var'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'cnt',
        @level2type = N'COLUMN',
        @level2name = N'var';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Difference between actual and expected quantities (variance)',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'cnt',
    @level2type = N'COLUMN',
    @level2name = N'var';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'cnt'
    AND c.name = 'usr'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'cnt',
        @level2type = N'COLUMN',
        @level2name = N'usr';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Name of the user who performed the count',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'cnt',
    @level2type = N'COLUMN',
    @level2name = N'usr';
GO

-- Table: inv.po
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'inv'
    AND t.name = 'po'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'po';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'This table stores purchase order header information, capturing each PO''s unique identifier, supplier, order and expected delivery dates, status, total amount, shipping charge and optional notes.',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'po';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'po'
    AND c.name = 'po_id'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'po',
        @level2type = N'COLUMN',
        @level2name = N'po_id';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique purchase order identifier (primary key).',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'po',
    @level2type = N'COLUMN',
    @level2name = N'po_id';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'po'
    AND c.name = 'sup_id'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'po',
        @level2type = N'COLUMN',
        @level2name = N'sup_id';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Identifier of the supplier who issued the purchase order.',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'po',
    @level2type = N'COLUMN',
    @level2name = N'sup_id';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'po'
    AND c.name = 'po_dt'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'po',
        @level2type = N'COLUMN',
        @level2name = N'po_dt';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the purchase order was created/issued.',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'po',
    @level2type = N'COLUMN',
    @level2name = N'po_dt';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'po'
    AND c.name = 'exp_dt'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'po',
        @level2type = N'COLUMN',
        @level2name = N'exp_dt';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Expected delivery or receipt date for the order.',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'po',
    @level2type = N'COLUMN',
    @level2name = N'exp_dt';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'po'
    AND c.name = 'sts'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'po',
        @level2type = N'COLUMN',
        @level2name = N'sts';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Current status of the purchase order (e.g., A=Approved, P=Pending, R=Received, S=Shipped, X=Cancelled).',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'po',
    @level2type = N'COLUMN',
    @level2name = N'sts';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'po'
    AND c.name = 'tot'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'po',
        @level2type = N'COLUMN',
        @level2name = N'tot';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Total monetary value of the purchase order before shipping.',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'po',
    @level2type = N'COLUMN',
    @level2name = N'tot';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'po'
    AND c.name = 'ship_amt'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'po',
        @level2type = N'COLUMN',
        @level2name = N'ship_amt';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Flat shipping charge applied to the order (150) or none (0).',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'po',
    @level2type = N'COLUMN',
    @level2name = N'ship_amt';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'po'
    AND c.name = 'notes'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'po',
        @level2type = N'COLUMN',
        @level2name = N'notes';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional free‑text note, currently used only for ''Expedited shipping requested''.',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'po',
    @level2type = N'COLUMN',
    @level2name = N'notes';
GO

-- Table: inv.po_dtl
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'inv'
    AND t.name = 'po_dtl'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'po_dtl';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores the line‑item details for each purchase order, linking a purchase order (inv.po) to the specific product (inv.prd) being ordered, the quantity ordered, unit price, and the quantity actually received.',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'po_dtl';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'po_dtl'
    AND c.name = 'po_id'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'po_dtl',
        @level2type = N'COLUMN',
        @level2name = N'po_id';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Identifier of the purchase order this line belongs to; links to inv.po.po_id',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'po_dtl',
    @level2type = N'COLUMN',
    @level2name = N'po_id';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'po_dtl'
    AND c.name = 'seq'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'po_dtl',
        @level2type = N'COLUMN',
        @level2name = N'seq';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Sequential line number within the purchase order, defining the order of items',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'po_dtl',
    @level2type = N'COLUMN',
    @level2name = N'seq';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'po_dtl'
    AND c.name = 'prd_id'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'po_dtl',
        @level2type = N'COLUMN',
        @level2name = N'prd_id';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Identifier of the product being ordered; links to inv.prd.prd_id',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'po_dtl',
    @level2type = N'COLUMN',
    @level2name = N'prd_id';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'po_dtl'
    AND c.name = 'qty'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'po_dtl',
        @level2type = N'COLUMN',
        @level2name = N'qty';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Quantity of the product ordered on this line',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'po_dtl',
    @level2type = N'COLUMN',
    @level2name = N'qty';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'po_dtl'
    AND c.name = 'prc'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'po_dtl',
        @level2type = N'COLUMN',
        @level2name = N'prc';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unit price of the product for this line (price at time of order)',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'po_dtl',
    @level2type = N'COLUMN',
    @level2name = N'prc';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'po_dtl'
    AND c.name = 'rcv_qty'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'po_dtl',
        @level2type = N'COLUMN',
        @level2name = N'rcv_qty';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Quantity of the product that has been received against this line',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'po_dtl',
    @level2type = N'COLUMN',
    @level2name = N'rcv_qty';
GO

-- Table: inv.prd
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'inv'
    AND t.name = 'prd'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'prd';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The inv.prd table is the master product catalog. It stores one row per distinct product (SKU) with its identifiers, classification, supplier, descriptive details, pricing, cost, status, weight and unit of measure, enabling inventory, purchasing and sales processes to reference a single source of product information.',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'prd';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'prd'
    AND c.name = 'prd_id'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'prd',
        @level2type = N'COLUMN',
        @level2name = N'prd_id';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique surrogate key for each product record; primary identifier used throughout the system',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'prd',
    @level2type = N'COLUMN',
    @level2name = N'prd_id';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'prd'
    AND c.name = 'cat_id'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'prd',
        @level2type = N'COLUMN',
        @level2name = N'cat_id';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to inv.cat identifying the product''s category',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'prd',
    @level2type = N'COLUMN',
    @level2name = N'cat_id';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'prd'
    AND c.name = 'sup_id'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'prd',
        @level2type = N'COLUMN',
        @level2name = N'sup_id';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to inv.sup identifying the product''s supplier',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'prd',
    @level2type = N'COLUMN',
    @level2name = N'sup_id';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'prd'
    AND c.name = 'sku'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'prd',
        @level2type = N'COLUMN',
        @level2name = N'sku';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stock Keeping Unit code, a human‑readable unique product identifier',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'prd',
    @level2type = N'COLUMN',
    @level2name = N'sku';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'prd'
    AND c.name = 'nm'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'prd',
        @level2type = N'COLUMN',
        @level2name = N'nm';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Product name, often including variant information',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'prd',
    @level2type = N'COLUMN',
    @level2name = N'nm';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'prd'
    AND c.name = 'dsc'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'prd',
        @level2type = N'COLUMN',
        @level2name = N'dsc';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Short description or marketing copy for the product',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'prd',
    @level2type = N'COLUMN',
    @level2name = N'dsc';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'prd'
    AND c.name = 'prc'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'prd',
        @level2type = N'COLUMN',
        @level2name = N'prc';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Retail selling price of the product',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'prd',
    @level2type = N'COLUMN',
    @level2name = N'prc';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'prd'
    AND c.name = 'cost'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'prd',
        @level2type = N'COLUMN',
        @level2name = N'cost';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Internal cost or purchase price of the product',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'prd',
    @level2type = N'COLUMN',
    @level2name = N'cost';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'prd'
    AND c.name = 'sts'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'prd',
        @level2type = N'COLUMN',
        @level2name = N'sts';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Current status of the product (A=Active, O=Obsolete, D=Discontinued)',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'prd',
    @level2type = N'COLUMN',
    @level2name = N'sts';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'prd'
    AND c.name = 'wgt'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'prd',
        @level2type = N'COLUMN',
        @level2name = N'wgt';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Weight of the product in its base unit of measure',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'prd',
    @level2type = N'COLUMN',
    @level2name = N'wgt';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'prd'
    AND c.name = 'uom'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'prd',
        @level2type = N'COLUMN',
        @level2name = N'uom';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unit of measure for inventory transactions (EA=Each, BX=Box, CS=Case)',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'prd',
    @level2type = N'COLUMN',
    @level2name = N'uom';
GO

-- Table: inv.rcv
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'inv'
    AND t.name = 'rcv'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'rcv';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'inv.rcv stores each receipt of inventory items linked to a purchase order, recording when the goods arrived, which warehouse received them, and any remarks such as partial shipments or backorders.',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'rcv';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'rcv'
    AND c.name = 'rcv_id'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'rcv',
        @level2type = N'COLUMN',
        @level2name = N'rcv_id';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier for each receipt record',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'rcv',
    @level2type = N'COLUMN',
    @level2name = N'rcv_id';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'rcv'
    AND c.name = 'po_id'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'rcv',
        @level2type = N'COLUMN',
        @level2name = N'po_id';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Identifier of the purchase order that the receipt fulfills',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'rcv',
    @level2type = N'COLUMN',
    @level2name = N'po_id';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'rcv'
    AND c.name = 'rcv_dt'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'rcv',
        @level2type = N'COLUMN',
        @level2name = N'rcv_dt';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the goods were received in the warehouse',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'rcv',
    @level2type = N'COLUMN',
    @level2name = N'rcv_dt';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'rcv'
    AND c.name = 'whs_id'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'rcv',
        @level2type = N'COLUMN',
        @level2name = N'whs_id';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Warehouse where the items were received',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'rcv',
    @level2type = N'COLUMN',
    @level2name = N'whs_id';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'rcv'
    AND c.name = 'notes'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'rcv',
        @level2type = N'COLUMN',
        @level2name = N'notes';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Free‑text comment about the receipt, commonly indicating a partial shipment and remaining backorder',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'rcv',
    @level2type = N'COLUMN',
    @level2name = N'notes';
GO

-- Table: inv.stk
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'inv'
    AND t.name = 'stk'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'stk';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores the current inventory status for each product at each warehouse, including on‑hand quantity, reserved quantity, reorder thresholds, and the dates of the last physical count and last receipt.',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'stk';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'stk'
    AND c.name = 'prd_id'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'stk',
        @level2type = N'COLUMN',
        @level2name = N'prd_id';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Identifier of the product (SKU) stored in inv.prd.',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'stk',
    @level2type = N'COLUMN',
    @level2name = N'prd_id';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'stk'
    AND c.name = 'whs_id'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'stk',
        @level2type = N'COLUMN',
        @level2name = N'whs_id';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Identifier of the warehouse where the product is stocked, referencing inv.whs.',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'stk',
    @level2type = N'COLUMN',
    @level2name = N'whs_id';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'stk'
    AND c.name = 'qty'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'stk',
        @level2type = N'COLUMN',
        @level2name = N'qty';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Current on‑hand quantity of the product at the warehouse.',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'stk',
    @level2type = N'COLUMN',
    @level2name = N'qty';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'stk'
    AND c.name = 'rsv'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'stk',
        @level2type = N'COLUMN',
        @level2name = N'rsv';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Quantity of the product that is reserved for pending orders.',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'stk',
    @level2type = N'COLUMN',
    @level2name = N'rsv';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'stk'
    AND c.name = 'min_qty'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'stk',
        @level2type = N'COLUMN',
        @level2name = N'min_qty';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Minimum desired stock level (reorder point) for the product at the warehouse.',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'stk',
    @level2type = N'COLUMN',
    @level2name = N'min_qty';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'stk'
    AND c.name = 'max_qty'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'stk',
        @level2type = N'COLUMN',
        @level2name = N'max_qty';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Maximum allowed stock level for the product at the warehouse.',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'stk',
    @level2type = N'COLUMN',
    @level2name = N'max_qty';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'stk'
    AND c.name = 'lst_cnt'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'stk',
        @level2type = N'COLUMN',
        @level2name = N'lst_cnt';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date of the most recent physical inventory count for this product‑warehouse pair.',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'stk',
    @level2type = N'COLUMN',
    @level2name = N'lst_cnt';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'stk'
    AND c.name = 'lst_rcv'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'stk',
        @level2type = N'COLUMN',
        @level2name = N'lst_rcv';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date of the most recent receipt (incoming shipment) of this product at the warehouse.',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'stk',
    @level2type = N'COLUMN',
    @level2name = N'lst_rcv';
GO

-- Table: inv.sup
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'inv'
    AND t.name = 'sup'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'sup';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Master table storing supplier information, including identification, name, status, payment terms, rating, and primary contact details for each supplier.',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'sup';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'sup'
    AND c.name = 'sup_id'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'sup',
        @level2type = N'COLUMN',
        @level2name = N'sup_id';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier for each supplier (primary key).',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'sup',
    @level2type = N'COLUMN',
    @level2name = N'sup_id';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'sup'
    AND c.name = 'nm'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'sup',
        @level2type = N'COLUMN',
        @level2name = N'nm';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Legal or trade name of the supplier.',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'sup',
    @level2type = N'COLUMN',
    @level2name = N'nm';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'sup'
    AND c.name = 'sts'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'sup',
        @level2type = N'COLUMN',
        @level2name = N'sts';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Current status of the supplier (e.g., Active, Terminated, Suspended, Inactive).',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'sup',
    @level2type = N'COLUMN',
    @level2name = N'sts';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'sup'
    AND c.name = 'pmt_trm'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'sup',
        @level2type = N'COLUMN',
        @level2name = N'pmt_trm';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Standard payment terms offered by the supplier (Net 30, Net 60, Net 45, Net 15, Cash on Delivery).',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'sup',
    @level2type = N'COLUMN',
    @level2name = N'pmt_trm';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'sup'
    AND c.name = 'rtg'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'sup',
        @level2type = N'COLUMN',
        @level2name = N'rtg';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Internal rating of the supplier on a scale of 1 (lowest) to 5 (highest).',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'sup',
    @level2type = N'COLUMN',
    @level2name = N'rtg';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'sup'
    AND c.name = 'cnt_nm'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'sup',
        @level2type = N'COLUMN',
        @level2name = N'cnt_nm';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Name of the primary contact person at the supplier.',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'sup',
    @level2type = N'COLUMN',
    @level2name = N'cnt_nm';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'sup'
    AND c.name = 'cnt_phn'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'sup',
        @level2type = N'COLUMN',
        @level2name = N'cnt_phn';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Phone number of the primary contact.',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'sup',
    @level2type = N'COLUMN',
    @level2name = N'cnt_phn';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'sup'
    AND c.name = 'cnt_eml'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'sup',
        @level2type = N'COLUMN',
        @level2name = N'cnt_eml';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Email address of the primary contact.',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'sup',
    @level2type = N'COLUMN',
    @level2name = N'cnt_eml';
GO

-- Table: inv.whs
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'inv'
    AND t.name = 'whs'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'whs';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A lookup table that stores master information about each warehouse used in the inventory and shipping processes, including its unique identifier, short code, full name, location (city and state), type, capacity, and operational status.',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'whs';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'whs'
    AND c.name = 'whs_id'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'whs',
        @level2type = N'COLUMN',
        @level2name = N'whs_id';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier for each warehouse record',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'whs',
    @level2type = N'COLUMN',
    @level2name = N'whs_id';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'whs'
    AND c.name = 'cd'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'whs',
        @level2type = N'COLUMN',
        @level2name = N'cd';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Short alphanumeric code for the warehouse (e.g., SEA, NYC)',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'whs',
    @level2type = N'COLUMN',
    @level2name = N'cd';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'whs'
    AND c.name = 'nm'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'whs',
        @level2type = N'COLUMN',
        @level2name = N'nm';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Full descriptive name of the warehouse location',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'whs',
    @level2type = N'COLUMN',
    @level2name = N'nm';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'whs'
    AND c.name = 'cty'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'whs',
        @level2type = N'COLUMN',
        @level2name = N'cty';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'City where the warehouse is located',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'whs',
    @level2type = N'COLUMN',
    @level2name = N'cty';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'whs'
    AND c.name = 'st'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'whs',
        @level2type = N'COLUMN',
        @level2name = N'st';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Two‑letter state abbreviation for the warehouse location',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'whs',
    @level2type = N'COLUMN',
    @level2name = N'st';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'whs'
    AND c.name = 'typ'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'whs',
        @level2type = N'COLUMN',
        @level2name = N'typ';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Warehouse type code (R=Regional, M=Manufacturing, D=Distribution)',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'whs',
    @level2type = N'COLUMN',
    @level2name = N'typ';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'whs'
    AND c.name = 'cap'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'whs',
        @level2type = N'COLUMN',
        @level2name = N'cap';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Maximum capacity of the warehouse (e.g., square footage or unit volume)',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'whs',
    @level2type = N'COLUMN',
    @level2name = N'cap';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'inv'
    AND t.name = 'whs'
    AND c.name = 'sts'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'inv',
        @level1type = N'TABLE',
        @level1name = N'whs',
        @level2type = N'COLUMN',
        @level2name = N'sts';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Operational status of the warehouse (A=Active, M=Maintenance)',
    @level0type = N'SCHEMA',
    @level0name = N'inv',
    @level1type = N'TABLE',
    @level1name = N'whs',
    @level2type = N'COLUMN',
    @level2name = N'sts';
GO


-- Schema: sales

-- Table: sales.addr
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'sales'
    AND t.name = 'addr'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'addr';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores individual address records for customers, including street lines, city, state, zip, country, address type (shipping, office, billing) and a default flag indicating the primary address for the customer.',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'addr';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'addr'
    AND c.name = 'addr_id'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'addr',
        @level2type = N'COLUMN',
        @level2name = N'addr_id';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Surrogate primary key for the address record',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'addr',
    @level2type = N'COLUMN',
    @level2name = N'addr_id';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'addr'
    AND c.name = 'cst_id'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'addr',
        @level2type = N'COLUMN',
        @level2name = N'cst_id';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key linking the address to a customer in sales.cst',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'addr',
    @level2type = N'COLUMN',
    @level2name = N'cst_id';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'addr'
    AND c.name = 'typ'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'addr',
        @level2type = N'COLUMN',
        @level2name = N'typ';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Address type code: S=Shipping, O=Office, B=Billing',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'addr',
    @level2type = N'COLUMN',
    @level2name = N'typ';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'addr'
    AND c.name = 'ln1'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'addr',
        @level2type = N'COLUMN',
        @level2name = N'ln1';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'First line of the street address (e.g., street number and name)',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'addr',
    @level2type = N'COLUMN',
    @level2name = N'ln1';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'addr'
    AND c.name = 'ln2'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'addr',
        @level2type = N'COLUMN',
        @level2name = N'ln2';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Second address line, usually suite or unit number; optional',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'addr',
    @level2type = N'COLUMN',
    @level2name = N'ln2';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'addr'
    AND c.name = 'cty'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'addr',
        @level2type = N'COLUMN',
        @level2name = N'cty';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'City name of the address',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'addr',
    @level2type = N'COLUMN',
    @level2name = N'cty';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'addr'
    AND c.name = 'st'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'addr',
        @level2type = N'COLUMN',
        @level2name = N'st';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Two‑letter US state abbreviation',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'addr',
    @level2type = N'COLUMN',
    @level2name = N'st';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'addr'
    AND c.name = 'zip'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'addr',
        @level2type = N'COLUMN',
        @level2name = N'zip';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'5‑digit ZIP code',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'addr',
    @level2type = N'COLUMN',
    @level2name = N'zip';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'addr'
    AND c.name = 'ctry'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'addr',
        @level2type = N'COLUMN',
        @level2name = N'ctry';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Country code, always ''US''',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'addr',
    @level2type = N'COLUMN',
    @level2name = N'ctry';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'addr'
    AND c.name = 'dflt'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'addr',
        @level2type = N'COLUMN',
        @level2name = N'dflt';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Flag indicating whether this address is the default for the customer',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'addr',
    @level2type = N'COLUMN',
    @level2name = N'dflt';
GO

-- Table: sales.cst
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'sales'
    AND t.name = 'cst'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'cst';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Central customer master table for the sales domain that stores core customer attributes (ID, name, status, acquisition source, sales rep, market segment, rating, balance, credit limit, last order date) and serves as the primary entity referenced by related tables for multiple addresses, emails, phone numbers, notes, and orders, enabling one‑to‑many relationships for contact details and interaction history.',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'cst';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'cst'
    AND c.name = 'cst_id'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'cst',
        @level2type = N'COLUMN',
        @level2name = N'cst_id';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier for each customer (primary key).',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'cst',
    @level2type = N'COLUMN',
    @level2name = N'cst_id';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'cst'
    AND c.name = 'nm'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'cst',
        @level2type = N'COLUMN',
        @level2name = N'nm';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Customer name, typically a company or individual name.',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'cst',
    @level2type = N'COLUMN',
    @level2name = N'nm';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'cst'
    AND c.name = 'sts'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'cst',
        @level2type = N'COLUMN',
        @level2name = N'sts';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Current status of the customer (e.g., A=Active, I=Inactive, S=Suspended, T=Terminated).',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'cst',
    @level2type = N'COLUMN',
    @level2name = N'sts';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'cst'
    AND c.name = 'dt'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'cst',
        @level2type = N'COLUMN',
        @level2name = N'dt';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the customer record was created or the customer was onboarded.',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'cst',
    @level2type = N'COLUMN',
    @level2name = N'dt';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'cst'
    AND c.name = 'src'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'cst',
        @level2type = N'COLUMN',
        @level2name = N'src';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Acquisition source of the customer (WB=Web, ST=Store, RF=Referral, PH=Phone).',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'cst',
    @level2type = N'COLUMN',
    @level2name = N'src';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'cst'
    AND c.name = 'rep_id'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'cst',
        @level2type = N'COLUMN',
        @level2name = N'rep_id';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Identifier of the sales representative assigned to the customer.',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'cst',
    @level2type = N'COLUMN',
    @level2name = N'rep_id';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'cst'
    AND c.name = 'seg'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'cst',
        @level2type = N'COLUMN',
        @level2name = N'seg';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Market segment classification (W=Wholesale, R=Retail, E=E‑commerce).',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'cst',
    @level2type = N'COLUMN',
    @level2name = N'seg';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'cst'
    AND c.name = 'rtg'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'cst',
        @level2type = N'COLUMN',
        @level2name = N'rtg';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Customer rating on a scale of 1 (lowest) to 5 (highest).',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'cst',
    @level2type = N'COLUMN',
    @level2name = N'rtg';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'cst'
    AND c.name = 'bal'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'cst',
        @level2type = N'COLUMN',
        @level2name = N'bal';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Current monetary balance owed by the customer.',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'cst',
    @level2type = N'COLUMN',
    @level2name = N'bal';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'cst'
    AND c.name = 'cr_lmt'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'cst',
        @level2type = N'COLUMN',
        @level2name = N'cr_lmt';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Credit limit assigned to the customer.',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'cst',
    @level2type = N'COLUMN',
    @level2name = N'cr_lmt';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'cst'
    AND c.name = 'lst_ord'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'cst',
        @level2type = N'COLUMN',
        @level2name = N'lst_ord';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date of the most recent order placed by the customer (nullable).',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'cst',
    @level2type = N'COLUMN',
    @level2name = N'lst_ord';
GO

-- Table: sales.cst_note
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'sales'
    AND t.name = 'cst_note'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'cst_note';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores individual notes or interaction records for each customer, capturing when, by whom, and what was communicated, along with a short type code indicating the communication channel.',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'cst_note';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'cst_note'
    AND c.name = 'note_id'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'cst_note',
        @level2type = N'COLUMN',
        @level2name = N'note_id';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier for each customer note record.',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'cst_note',
    @level2type = N'COLUMN',
    @level2name = N'note_id';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'cst_note'
    AND c.name = 'cst_id'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'cst_note',
        @level2type = N'COLUMN',
        @level2name = N'cst_id';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Identifier of the customer to which the note pertains.',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'cst_note',
    @level2type = N'COLUMN',
    @level2name = N'cst_id';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'cst_note'
    AND c.name = 'dt'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'cst_note',
        @level2type = N'COLUMN',
        @level2name = N'dt';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date when the note was created or the interaction occurred.',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'cst_note',
    @level2type = N'COLUMN',
    @level2name = N'dt';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'cst_note'
    AND c.name = 'usr'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'cst_note',
        @level2type = N'COLUMN',
        @level2name = N'usr';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Name of the sales employee or user who recorded the note.',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'cst_note',
    @level2type = N'COLUMN',
    @level2name = N'usr';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'cst_note'
    AND c.name = 'txt'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'cst_note',
        @level2type = N'COLUMN',
        @level2name = N'txt';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Full text description of the interaction or note content.',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'cst_note',
    @level2type = N'COLUMN',
    @level2name = N'txt';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'cst_note'
    AND c.name = 'typ'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'cst_note',
        @level2type = N'COLUMN',
        @level2name = N'typ';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Single‑character code indicating the communication type (M=Meeting, E=Email, O=Phone/Other, C=Call).',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'cst_note',
    @level2type = N'COLUMN',
    @level2name = N'typ';
GO

-- Table: sales.eml
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'sales'
    AND t.name = 'eml'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'eml';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores email address records for customers, including address, type, verification status, and default flag',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'eml';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'eml'
    AND c.name = 'eml_id'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'eml',
        @level2type = N'COLUMN',
        @level2name = N'eml_id';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier for each email record',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'eml',
    @level2type = N'COLUMN',
    @level2name = N'eml_id';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'eml'
    AND c.name = 'cst_id'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'eml',
        @level2type = N'COLUMN',
        @level2name = N'cst_id';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Identifier of the customer that owns the email address',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'eml',
    @level2type = N'COLUMN',
    @level2name = N'cst_id';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'eml'
    AND c.name = 'typ'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'eml',
        @level2type = N'COLUMN',
        @level2name = N'typ';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Category of the email address (e.g., Work, Personal, Other)',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'eml',
    @level2type = N'COLUMN',
    @level2name = N'typ';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'eml'
    AND c.name = 'adr'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'eml',
        @level2type = N'COLUMN',
        @level2name = N'adr';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The actual email address string',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'eml',
    @level2type = N'COLUMN',
    @level2name = N'adr';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'eml'
    AND c.name = 'vrf'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'eml',
        @level2type = N'COLUMN',
        @level2name = N'vrf';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Flag indicating whether the email address has been verified',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'eml',
    @level2type = N'COLUMN',
    @level2name = N'vrf';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'eml'
    AND c.name = 'dflt'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'eml',
        @level2type = N'COLUMN',
        @level2name = N'dflt';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Flag indicating whether this email is the default/contact email for the customer',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'eml',
    @level2type = N'COLUMN',
    @level2name = N'dflt';
GO

-- Table: sales.oli
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'sales'
    AND t.name = 'oli'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'oli';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores individual line items for each sales order, capturing product, quantity, price, discount, tax, and line sequence, and acts as the reference point for payment and return processing, enabling partial payments and item‑specific returns.',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'oli';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'oli'
    AND c.name = 'oli_id'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'oli',
        @level2type = N'COLUMN',
        @level2name = N'oli_id';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier for the order line item.',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'oli',
    @level2type = N'COLUMN',
    @level2name = N'oli_id';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'oli'
    AND c.name = 'ord_id'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'oli',
        @level2type = N'COLUMN',
        @level2name = N'ord_id';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Identifier of the parent sales order to which this line belongs.',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'oli',
    @level2type = N'COLUMN',
    @level2name = N'ord_id';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'oli'
    AND c.name = 'prd_id'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'oli',
        @level2type = N'COLUMN',
        @level2name = N'prd_id';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Identifier of the product being sold on this line.',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'oli',
    @level2type = N'COLUMN',
    @level2name = N'prd_id';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'oli'
    AND c.name = 'qty'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'oli',
        @level2type = N'COLUMN',
        @level2name = N'qty';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Quantity of the product ordered on this line.',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'oli',
    @level2type = N'COLUMN',
    @level2name = N'qty';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'oli'
    AND c.name = 'prc'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'oli',
        @level2type = N'COLUMN',
        @level2name = N'prc';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unit price of the product at the time of the order.',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'oli',
    @level2type = N'COLUMN',
    @level2name = N'prc';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'oli'
    AND c.name = 'disc'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'oli',
        @level2type = N'COLUMN',
        @level2name = N'disc';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Discount amount applied to this line (if any).',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'oli',
    @level2type = N'COLUMN',
    @level2name = N'disc';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'oli'
    AND c.name = 'tax_amt'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'oli',
        @level2type = N'COLUMN',
        @level2name = N'tax_amt';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Tax amount calculated for this line.',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'oli',
    @level2type = N'COLUMN',
    @level2name = N'tax_amt';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'oli'
    AND c.name = 'seq'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'oli',
        @level2type = N'COLUMN',
        @level2name = N'seq';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Sequence number of the line within the order (line position).',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'oli',
    @level2type = N'COLUMN',
    @level2name = N'seq';
GO

-- Table: sales.ord
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'sales'
    AND t.name = 'ord'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'ord';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The sales.ord table stores individual sales orders, each linked to a single customer. It records order and shipping dates, a four‑value shipping status code (D,N,S,P), financial totals (subtotal, tax, shipping amount, discount percent, payment terms, notes) and uses tiered shipping cost values (15, 25, 45). An order can have up to six line‑item rows in the child sales.oli table, confirming a business rule limiting line items per order. Payments are captured at the customer level and may exist without a direct order reference, while returns are tied back to the originating order.',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'ord';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'ord'
    AND c.name = 'ord_id'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'ord',
        @level2type = N'COLUMN',
        @level2name = N'ord_id';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier for each sales order.',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'ord',
    @level2type = N'COLUMN',
    @level2name = N'ord_id';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'ord'
    AND c.name = 'cst_id'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'ord',
        @level2type = N'COLUMN',
        @level2name = N'cst_id';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Identifier of the customer who placed the order.',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'ord',
    @level2type = N'COLUMN',
    @level2name = N'cst_id';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'ord'
    AND c.name = 'ord_dt'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'ord',
        @level2type = N'COLUMN',
        @level2name = N'ord_dt';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the order was created.',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'ord',
    @level2type = N'COLUMN',
    @level2name = N'ord_dt';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'ord'
    AND c.name = 'ship_dt'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'ord',
        @level2type = N'COLUMN',
        @level2name = N'ship_dt';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the order was shipped; may be null for unshipped orders.',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'ord',
    @level2type = N'COLUMN',
    @level2name = N'ship_dt';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'ord'
    AND c.name = 'sts'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'ord',
        @level2type = N'COLUMN',
        @level2name = N'sts';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Current status of the order (e.g., D=Draft, C=Cancelled, S=Shipped, P=Pending, X=Closed).',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'ord',
    @level2type = N'COLUMN',
    @level2name = N'sts';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'ord'
    AND c.name = 'tot'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'ord',
        @level2type = N'COLUMN',
        @level2name = N'tot';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Total monetary amount of the order before tax and discounts.',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'ord',
    @level2type = N'COLUMN',
    @level2name = N'tot';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'ord'
    AND c.name = 'tax'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'ord',
        @level2type = N'COLUMN',
        @level2name = N'tax';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Tax amount applied to the order.',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'ord',
    @level2type = N'COLUMN',
    @level2name = N'tax';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'ord'
    AND c.name = 'ship_amt'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'ord',
        @level2type = N'COLUMN',
        @level2name = N'ship_amt';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Shipping charge for the order (0, 15, or 25).',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'ord',
    @level2type = N'COLUMN',
    @level2name = N'ship_amt';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'ord'
    AND c.name = 'disc_pct'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'ord',
        @level2type = N'COLUMN',
        @level2name = N'disc_pct';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Discount percentage applied to the order (0 or 10%).',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'ord',
    @level2type = N'COLUMN',
    @level2name = N'disc_pct';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'ord'
    AND c.name = 'pmt_trm'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'ord',
        @level2type = N'COLUMN',
        @level2name = N'pmt_trm';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Payment terms for the order (e.g., N30 = Net 30 days, COD = Cash on Delivery).',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'ord',
    @level2type = N'COLUMN',
    @level2name = N'pmt_trm';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'ord'
    AND c.name = 'notes'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'ord',
        @level2type = N'COLUMN',
        @level2name = N'notes';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional free‑text notes about the order; currently only used for rush‑order indication.',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'ord',
    @level2type = N'COLUMN',
    @level2name = N'notes';
GO

-- Table: sales.phn
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'sales'
    AND t.name = 'phn'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'phn';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores phone contact information for customers, including number, type, optional extension, and a flag indicating the default phone for each customer.',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'phn';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'phn'
    AND c.name = 'phn_id'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'phn',
        @level2type = N'COLUMN',
        @level2name = N'phn_id';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier for each phone record',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'phn',
    @level2type = N'COLUMN',
    @level2name = N'phn_id';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'phn'
    AND c.name = 'cst_id'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'phn',
        @level2type = N'COLUMN',
        @level2name = N'cst_id';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Identifier of the customer to which the phone belongs',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'phn',
    @level2type = N'COLUMN',
    @level2name = N'cst_id';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'phn'
    AND c.name = 'typ'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'phn',
        @level2type = N'COLUMN',
        @level2name = N'typ';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Type of phone (e.g., Work, Mobile, Home, Fax)',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'phn',
    @level2type = N'COLUMN',
    @level2name = N'typ';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'phn'
    AND c.name = 'num'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'phn',
        @level2type = N'COLUMN',
        @level2name = N'num';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The phone number value',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'phn',
    @level2type = N'COLUMN',
    @level2name = N'num';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'phn'
    AND c.name = 'ext'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'phn',
        @level2type = N'COLUMN',
        @level2name = N'ext';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Phone extension, optional',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'phn',
    @level2type = N'COLUMN',
    @level2name = N'ext';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'phn'
    AND c.name = 'dflt'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'phn',
        @level2type = N'COLUMN',
        @level2name = N'dflt';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Flag indicating whether this phone is the default for the customer',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'phn',
    @level2type = N'COLUMN',
    @level2name = N'dflt';
GO

-- Table: sales.pmt
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'sales'
    AND t.name = 'pmt'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'pmt';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The table stores individual payment records for sales, capturing when a payment was made, its amount, payment method, status, reference code, and optional notes. Each payment is uniquely identified and can be linked to a specific order line item (sales.oli) and to the customer who made the payment (sales.ord).',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'pmt';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'pmt'
    AND c.name = 'pmt_id'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'pmt',
        @level2type = N'COLUMN',
        @level2name = N'pmt_id';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier for each payment record.',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'pmt',
    @level2type = N'COLUMN',
    @level2name = N'pmt_id';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'pmt'
    AND c.name = 'ord_id'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'pmt',
        @level2type = N'COLUMN',
        @level2name = N'ord_id';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Identifier of the order line item (sales.oli) that the payment is associated with; nullable for payments not tied to a specific line.',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'pmt',
    @level2type = N'COLUMN',
    @level2name = N'ord_id';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'pmt'
    AND c.name = 'cst_id'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'pmt',
        @level2type = N'COLUMN',
        @level2name = N'cst_id';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Identifier of the customer (sales.ord) who made the payment.',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'pmt',
    @level2type = N'COLUMN',
    @level2name = N'cst_id';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'pmt'
    AND c.name = 'pmt_dt'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'pmt',
        @level2type = N'COLUMN',
        @level2name = N'pmt_dt';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the payment was received or recorded.',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'pmt',
    @level2type = N'COLUMN',
    @level2name = N'pmt_dt';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'pmt'
    AND c.name = 'amt'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'pmt',
        @level2type = N'COLUMN',
        @level2name = N'amt';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Monetary amount of the payment.',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'pmt',
    @level2type = N'COLUMN',
    @level2name = N'amt';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'pmt'
    AND c.name = 'mthd'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'pmt',
        @level2type = N'COLUMN',
        @level2name = N'mthd';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Payment method code (WR=Wire, CA=Cash, CK=Check, CC=Credit Card).',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'pmt',
    @level2type = N'COLUMN',
    @level2name = N'mthd';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'pmt'
    AND c.name = 'sts'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'pmt',
        @level2type = N'COLUMN',
        @level2name = N'sts';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Current status of the payment (A=Approved, F=Failed, P=Pending, R=Refunded).',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'pmt',
    @level2type = N'COLUMN',
    @level2name = N'sts';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'pmt'
    AND c.name = 'ref'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'pmt',
        @level2type = N'COLUMN',
        @level2name = N'ref';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'External reference number or code for the payment, e.g., ''PMT-2023-01246''.',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'pmt',
    @level2type = N'COLUMN',
    @level2name = N'ref';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'pmt'
    AND c.name = 'notes'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'pmt',
        @level2type = N'COLUMN',
        @level2name = N'notes';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional free‑text notes about the payment; frequently indicates account credit usage.',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'pmt',
    @level2type = N'COLUMN',
    @level2name = N'notes';
GO

-- Table: sales.rtn
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'sales'
    AND t.name = 'rtn'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'rtn';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The table stores individual product return records, linking each return to a specific sales order and its line item, and capturing return date, reason, quantity, monetary amount, status, and optional notes.',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'rtn';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'rtn'
    AND c.name = 'rtn_id'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'rtn',
        @level2type = N'COLUMN',
        @level2name = N'rtn_id';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier for each return record.',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'rtn',
    @level2type = N'COLUMN',
    @level2name = N'rtn_id';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'rtn'
    AND c.name = 'ord_id'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'rtn',
        @level2type = N'COLUMN',
        @level2name = N'ord_id';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Identifier of the sales order to which the return belongs.',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'rtn',
    @level2type = N'COLUMN',
    @level2name = N'ord_id';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'rtn'
    AND c.name = 'oli_id'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'rtn',
        @level2type = N'COLUMN',
        @level2name = N'oli_id';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Identifier of the specific order line item being returned.',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'rtn',
    @level2type = N'COLUMN',
    @level2name = N'oli_id';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'rtn'
    AND c.name = 'rtn_dt'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'rtn',
        @level2type = N'COLUMN',
        @level2name = N'rtn_dt';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date when the return was processed.',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'rtn',
    @level2type = N'COLUMN',
    @level2name = N'rtn_dt';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'rtn'
    AND c.name = 'rsn'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'rtn',
        @level2type = N'COLUMN',
        @level2name = N'rsn';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reason code for the return (e.g., Wrong item, Dead on Arrival, Damaged, Customer changed mind).',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'rtn',
    @level2type = N'COLUMN',
    @level2name = N'rsn';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'rtn'
    AND c.name = 'qty'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'rtn',
        @level2type = N'COLUMN',
        @level2name = N'qty';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Quantity of items returned for the line item.',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'rtn',
    @level2type = N'COLUMN',
    @level2name = N'qty';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'rtn'
    AND c.name = 'amt'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'rtn',
        @level2type = N'COLUMN',
        @level2name = N'amt';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Monetary amount associated with the returned quantity.',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'rtn',
    @level2type = N'COLUMN',
    @level2name = N'amt';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'rtn'
    AND c.name = 'sts'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'rtn',
        @level2type = N'COLUMN',
        @level2name = N'sts';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Current processing status of the return (e.g., Approved, Rejected, Pending, Completed).',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'rtn',
    @level2type = N'COLUMN',
    @level2name = N'sts';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'rtn'
    AND c.name = 'notes'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'rtn',
        @level2type = N'COLUMN',
        @level2name = N'notes';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Free‑text note elaborating on the return reason.',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'rtn',
    @level2type = N'COLUMN',
    @level2name = N'notes';
GO

-- Table: sales.shp
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'sales'
    AND t.name = 'shp'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'shp';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The table stores individual shipment records for sales orders, capturing when each order was shipped, delivery dates, carrier information, tracking numbers, shipment status, weight, and shipping cost. It links each shipment to its originating order and the warehouse that dispatched it.',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'shp';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'shp'
    AND c.name = 'shp_id'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'shp',
        @level2type = N'COLUMN',
        @level2name = N'shp_id';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier for each shipment record.',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'shp',
    @level2type = N'COLUMN',
    @level2name = N'shp_id';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'shp'
    AND c.name = 'ord_id'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'shp',
        @level2type = N'COLUMN',
        @level2name = N'ord_id';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to the sales order that is being shipped.',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'shp',
    @level2type = N'COLUMN',
    @level2name = N'ord_id';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'shp'
    AND c.name = 'whs_id'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'shp',
        @level2type = N'COLUMN',
        @level2name = N'whs_id';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Identifier of the warehouse from which the shipment originated.',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'shp',
    @level2type = N'COLUMN',
    @level2name = N'whs_id';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'shp'
    AND c.name = 'ship_dt'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'shp',
        @level2type = N'COLUMN',
        @level2name = N'ship_dt';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the shipment left the warehouse.',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'shp',
    @level2type = N'COLUMN',
    @level2name = N'ship_dt';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'shp'
    AND c.name = 'dlv_dt'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'shp',
        @level2type = N'COLUMN',
        @level2name = N'dlv_dt';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Actual delivery date of the shipment; may be null if not yet delivered.',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'shp',
    @level2type = N'COLUMN',
    @level2name = N'dlv_dt';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'shp'
    AND c.name = 'carr'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'shp',
        @level2type = N'COLUMN',
        @level2name = N'carr';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Carrier used for the shipment (e.g., USPS Priority, DHL Express).',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'shp',
    @level2type = N'COLUMN',
    @level2name = N'carr';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'shp'
    AND c.name = 'trk'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'shp',
        @level2type = N'COLUMN',
        @level2name = N'trk';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Tracking number assigned by the carrier.',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'shp',
    @level2type = N'COLUMN',
    @level2name = N'trk';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'shp'
    AND c.name = 'sts'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'shp',
        @level2type = N'COLUMN',
        @level2name = N'sts';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Current shipment status code: D=Delivered, N=Not shipped, S=Shipped, P=Pending.',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'shp',
    @level2type = N'COLUMN',
    @level2name = N'sts';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'shp'
    AND c.name = 'wgt'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'shp',
        @level2type = N'COLUMN',
        @level2name = N'wgt';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Weight of the shipment (likely in pounds or kilograms).',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'shp',
    @level2type = N'COLUMN',
    @level2name = N'wgt';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'sales'
    AND t.name = 'shp'
    AND c.name = 'cost'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'sales',
        @level1type = N'TABLE',
        @level1name = N'shp',
        @level2type = N'COLUMN',
        @level2name = N'cost';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Shipping cost charged for the shipment.',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'shp',
    @level2type = N'COLUMN',
    @level2name = N'cost';
GO
