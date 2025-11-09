-- Database Documentation Script
-- Generated: 2025-11-09T04:30:54.321Z
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
    @value = N'Stores inventory adjustment records, capturing changes to product stock levels per warehouse, including quantity, reason, date, responsible user and notes.',
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
    @value = N'Unique identifier for each inventory adjustment record',
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
    @value = N'Foreign key to inv.prd identifying the product being adjusted',
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
    @value = N'Foreign key to inv.whs indicating the warehouse where the adjustment occurred',
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
    @value = N'Name of the user/employee who performed the adjustment',
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
    @value = N'Free‑text note describing the adjustment context',
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
    @value = N'Lookup table defining product categories and subcategories for inventory management, supporting a two‑level hierarchy.',
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
    @value = N'Unique identifier for each category record',
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
    @value = N'Identifier of the parent category (self‑reference to inv.cat)',
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
    @value = N'Name of the category or subcategory',
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
    @value = N'Longer description of the category',
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
    @value = N'Hierarchy level of the category (1 = top level, 2 = sub‑category)',
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
    @value = N'Display order of categories within the same parent',
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
    @value = N'Stores inventory count (stock‑take) records, capturing the expected system quantity versus the physically counted quantity for each product in each warehouse on a specific date, along with the variance and the user who performed the count.',
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
    @value = N'Primary key for the inventory count record.',
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
    @value = N'Foreign key to inv.whs identifying the warehouse where the count was performed.',
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
    @value = N'Date of the inventory count (stock‑take).',
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
    @value = N'Foreign key to inv.prd identifying the product being counted.',
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
    @value = N'Quantity expected by the system for the product in the warehouse at the time of count.',
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
    @value = N'Quantity actually observed during the physical count.',
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
    @value = N'Variance between expected and actual quantities (act_qty - exp_qty).',
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
    @value = N'Name of the user/employee who performed the count.',
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
    @value = N'Stores purchase order header information, capturing each order placed with a supplier, its dates, status, total amount, shipping charge, and optional notes.',
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
    @value = N'Unique identifier for the purchase order (primary key).',
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
    @value = N'Foreign key to inv.sup identifying the supplier for the order.',
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
    @value = N'Date the purchase order was created.',
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
    @value = N'Expected delivery date for the order.',
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
    @value = N'Current status of the purchase order, using codes X, S, R, P, A.',
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
    @value = N'Total monetary amount of the purchase order.',
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
    @value = N'Shipping charge applied to the order (either 150 or 0).',
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
    @value = N'Optional free‑text note, often indicating expedited shipping.',
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
    @value = N'Stores the line‑item details of purchase orders, linking each order (inv.po) to the products ordered (inv.prd) with quantities, unit price and received quantity.',
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
    @value = N'Identifier of the purchase order; foreign key to inv.po.',
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
    @value = N'Sequence number of the line item within the purchase order.',
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
    @value = N'Identifier of the product being ordered; foreign key to inv.prd.',
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
    @value = N'Quantity ordered for the product on this line.',
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
    @value = N'Unit price of the product at the time of ordering.',
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
    @value = N'Quantity of the product actually received for this line item.',
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
    @value = N'Stores detailed information about each product, linking it to its category and supplier, and includes pricing, cost, inventory attributes, and status.',
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
    @value = N'Unique identifier for each product.',
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
    @value = N'Foreign key to inv.cat identifying the product''s category.',
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
    @value = N'Foreign key to inv.sup identifying the product''s supplier.',
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
    @value = N'Stock Keeping Unit code used for inventory tracking.',
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
    @value = N'Product name or title.',
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
    @value = N'Short description of the product.',
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
    @value = N'Selling price of the product.',
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
    @value = N'Cost to acquire or produce the product.',
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
    @value = N'Current status of the product (A=Active, O=On order, D=Discontinued).',
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
    @value = N'Weight of the product.',
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
    @value = N'Unit of measure for inventory (EA=Each, BX=Box, CS=Case).',
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
    @value = N'Stores receipt records for purchase orders, capturing when and where items were received and any notes about partial shipments.',
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
    @value = N'Primary key for the receipt record; uniquely identifies each receipt event.',
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
    @value = N'Foreign key to inv.po; identifies the purchase order that this receipt fulfills.',
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
    @value = N'Date the goods were received.',
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
    @value = N'Foreign key to inv.whs; indicates the warehouse where the items were received.',
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
    @value = N'Optional free‑text comment about the receipt, e.g., partial shipment information.',
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
    @value = N'Stores inventory levels for each product at each warehouse, including current quantity, reserved quantity, reorder thresholds, and dates of last count and receipt.',
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
    @value = N'Foreign key to inv.prd identifying the product.',
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
    @value = N'Foreign key to inv.whs identifying the warehouse.',
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
    @value = N'Quantity of the product reserved for pending orders.',
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
    @value = N'Maximum stock capacity or target level for the product at the warehouse.',
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
    @value = N'Date of the most recent receipt (stock replenishment) for this product‑warehouse pair.',
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
    @value = N'Stores master information about suppliers, including their unique identifier, name, status, payment terms, rating, and primary contact details (name, phone, email). This lookup table supports inventory and purchasing processes by providing reference data for supplier entities.',
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
    @value = N'Unique identifier for each supplier record',
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
    @value = N'Supplier''s legal or trade name',
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
    @value = N'Supplier status code (e.g., A=Active, T=Terminated, S=Suspended, I=Inactive)',
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
    @value = N'Payment terms code (N15, N30, N45, N60, COD)',
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
    @value = N'Supplier rating on a 1‑5 scale',
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
    @value = N'Primary contact person''s full name for the supplier',
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
    @value = N'Primary contact phone number',
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
    @value = N'Primary contact email address',
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
    @value = N'Stores master data for each warehouse used in the inventory system, including its identifier, short code, full name, location, type, capacity and operational status.',
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
    @value = N'Unique identifier for a warehouse record',
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
    @value = N'Three‑letter warehouse code used for short references',
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
    @value = N'Full descriptive name of the warehouse',
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
    @value = N'Warehouse type classification (e.g., R=Regional, M=Main, D=Distribution)',
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
    @value = N'Maximum capacity of the warehouse (units or square footage)',
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
    @value = N'Operational status of the warehouse (A=Active, M=Maintenance/Inactive)',
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
    @value = N'Stores mailing and location information for customers, linking each address to a customer and indicating its type (e.g., Shipping, Billing, Office) and whether it is the default address for that customer.',
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
    @value = N'Surrogate primary key for each address record',
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
    @value = N'Foreign key to sales.cst identifying the customer that owns the address',
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
    @value = N'Address type code (S=Shipping, O=Office, B=Billing)',
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
    @value = N'First line of the street address',
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
    @value = N'Second line of the address, often a suite or unit number; nullable',
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
    @value = N'City name for the address',
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
    @value = N'Two‑letter state abbreviation',
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
    @value = N'Postal code (ZIP) for the address',
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
    @value = N'Flag indicating if this is the customer''s default address',
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
    @value = N'A master table storing detailed information about each customer, including identification, name, status, acquisition source, assigned sales representative, market segment, rating, financial balance, credit limit and the date of the most recent order.',
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
    @value = N'Unique identifier for each customer record',
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
    @value = N'Full name of the customer (individual or organization)',
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
    @value = N'Current status of the customer (e.g., A=Active, S=Suspended, I=Inactive, T=Terminated)',
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
    @value = N'Date the customer was created or registered in the system',
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
    @value = N'Acquisition source of the customer (WB=Web, ST=Store, RF=Referral, PH=Phone)',
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
    @value = N'Identifier of the sales representative assigned to the customer',
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
    @value = N'Market segment classification (W=Wholesale, R=Retail, E=Enterprise)',
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
    @value = N'Customer rating on a scale of 1 to 5',
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
    @value = N'Current account balance for the customer',
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
    @value = N'Credit limit assigned to the customer',
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
    @value = N'Date of the most recent order placed by the customer (nullable)',
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
    @value = N'Stores individual interaction notes linked to customers, capturing when, by whom, and what was communicated during sales‑related contacts.',
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
    @value = N'Surrogate primary key uniquely identifying each note record',
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
    @value = N'Foreign key to sales.cst identifying the customer the note pertains to',
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
    @value = N'Date the note was created or the interaction occurred',
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
    @value = N'Name of the employee/user who recorded the note',
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
    @value = N'Full text of the interaction note describing the contact details',
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
    @value = N'Single‑character code indicating interaction type (M=Meeting, E=Email, O=Other, C=Call)',
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
    @value = N'Stores email addresses associated with customers, including type, verification status, and default flag. Acts as a linking table between customers and their email records.',
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
    @value = N'Unique identifier for the email record',
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
    @value = N'Identifier of the customer to which the email belongs (foreign key to sales.cst)',
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
    @value = N'Type of email address – Work (W), Personal (P) or Other (O)',
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
    @value = N'Flag indicating whether this email is the default contact for the customer',
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
    @value = N'Stores individual line items for sales orders, capturing which product was sold, in what quantity, at what price, with discounts, taxes and line sequence within each order. Each line item can be linked to payments and returns, enabling partial or line‑level payment allocation and return tracking.',
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
    @value = N'Unique identifier for the order line item (order line item ID)',
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
    @value = N'Foreign key to sales.ord identifying the parent order',
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
    @value = N'Foreign key to inv.prd indicating the product sold',
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
    @value = N'Quantity of the product ordered on this line',
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
    @value = N'Unit price (or line price) of the product before discounts and taxes',
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
    @value = N'Discount amount applied to this line item',
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
    @value = N'Tax amount calculated for this line item',
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
    @value = N'Sequence number of the line within the order (line order)',
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
    @value = N'This table stores order header information for sales transactions, capturing each order''s unique identifier, customer reference, dates, status, monetary totals, shipping details, discounts, payment terms, and optional notes. Each order is linked to a customer (sales.cst) via cst_id and can be referenced by multiple return records and multiple shipment rows, establishing one‑to‑many relationships for returns and shipments.',
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
    @value = N'Unique identifier for each order (order primary key).',
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
    @value = N'Identifier of the customer who placed the order; foreign key to sales.cst.',
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
    @value = N'Date the order was created/placed.',
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
    @value = N'Date the order was shipped; nullable because many orders are not yet shipped (40% null).',
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
    @value = N'Current status of the order, using codes D, C, S, P, X.',
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
    @value = N'Total amount of the order before tax and shipping.',
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
    @value = N'Shipping charge applied to the order (0, 15, or 25).',
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
    @value = N'Discount percentage applied to the order (0 or 10).',
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
    @value = N'Payment terms for the order (N30, COD, N45, N60).',
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
    @value = N'Optional free‑text notes about the order; mostly indicates rush/expedited shipping.',
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
    @value = N'Surrogate primary key uniquely identifying each phone record',
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
    @value = N'Foreign key to sales.cst identifying the customer that owns the phone number',
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
    @value = N'Phone type code (W=Work, M=Mobile, H=Home, F=Fax)',
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
    @value = N'The phone number string, stored in various display formats',
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
    @value = N'Optional telephone extension; nullable for most records',
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
    @value = N'Boolean flag indicating whether this number is the customer''s default contact number',
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
    @value = N'Stores individual payment records for sales orders, capturing when a payment was made, its amount, method, status, reference code and optional notes. Each payment links to a specific order line (sales.oli) and indirectly to the customer via the order.',
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
    @value = N'Foreign key to sales.oli.oli_id linking the payment to a specific order line item.',
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
    @value = N'Foreign key to sales.ord.cst_id identifying the customer who made the payment.',
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
    @value = N'Date the payment was received or processed.',
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
    @value = N'Payment method code: WR=Wire, CA=Cash, CK=Check, CC=Credit Card.',
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
    @value = N'Payment status: A=Approved, F=Failed, P=Pending, R=Refunded.',
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
    @value = N'External reference code for the payment, e.g., invoice or transaction number.',
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
    @value = N'Optional free‑text notes about the payment; currently used mainly for ''Account credit applied''.',
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
    @value = N'Stores individual product return records, linking each return to a specific order and order line item, with details on return date, reason, quantity, amount refunded, status, and optional notes.',
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
    @value = N'Primary key for the return record; uniquely identifies each return transaction.',
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
    @value = N'Foreign key to sales.ord, indicating the order to which the returned item belongs.',
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
    @value = N'Foreign key to sales.oli, identifying the specific order line item being returned.',
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
    @value = N'Date the return was processed or received.',
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
    @value = N'Reason code for the return (WRG=Wrong item, DOA=Dead on Arrival, DMG=Damaged, CHG=Customer changed mind).',
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
    @value = N'Monetary amount refunded or credited for the return.',
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
    @value = N'Current status of the return (A=Approved, R=Rejected, P=Pending, C=Completed).',
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
    @value = N'Free‑text explanation of the return, mirroring the rsn values in more detail.',
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
    @value = N'Stores individual shipment records linking orders to the warehouses that fulfill them, capturing shipping dates, carrier, tracking number, status, weight and cost of each shipment.',
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
    @value = N'Unique identifier for each shipment record',
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
    @value = N'Foreign key to sales.ord identifying the order being shipped',
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
    @value = N'Foreign key to inv.whs indicating the warehouse that dispatched the shipment',
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
    @value = N'Date the shipment left the warehouse',
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
    @value = N'Date the shipment was delivered (nullable)',
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
    @value = N'Shipping carrier used for the shipment (e.g., USPS Priority, DHL Express)',
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
    @value = N'Tracking number assigned by the carrier',
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
    @value = N'Shipment status code (D=Delivered, N=Not shipped, S=Shipped, P=Pending)',
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
    @value = N'Weight of the shipment (units unspecified)',
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
    @value = N'Shipping cost for the shipment (values 15,25,45)',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'shp',
    @level2type = N'COLUMN',
    @level2name = N'cost';
GO
