-- Database Documentation Script
-- Generated: 2025-11-09T00:27:31.036Z
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
    @value = N'This table logs inventory adjustments for products across warehouses, capturing when, where, how many units were added or removed, the reason for the change, the user who performed it, and any explanatory notes.',
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
    @value = N'Identifier of the warehouse where the adjustment occurred',
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
    @value = N'Date the inventory adjustment was recorded',
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
    @value = N'Quantity change; positive adds stock, negative removes stock',
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
    @value = N'Reason code for the adjustment (e.g., STL=stolen, EXP=expired, DAM=damaged, COR=correction)',
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
    @value = N'Free‑text description providing additional context for the adjustment',
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
    @value = N'A hierarchical lookup table that defines office‑related product categories and sub‑categories, storing each category''s identifier, optional parent category, name, description, hierarchy level, and display order.',
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
    @value = N'Identifier of the parent category; null for top‑level categories',
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
    @value = N'Short name of the category (e.g., "Paper", "Electronics")',
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
    @value = N'Longer description of the category purpose or contents',
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
    @value = N'Hierarchy depth: 1 for top‑level, 2 for sub‑level categories',
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
    @value = N'Display order of categories within the same level',
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
    @value = N'This table records inventory count (stock‑take) events. Each row captures a single product''s expected versus actual quantity on a specific date, at a particular warehouse, performed by a user. It is used to track stock discrepancies and support inventory reconciliation.',
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
    @value = N'Unique identifier for the inventory count record',
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
    @value = N'Identifier of the warehouse where the count was performed',
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
    @value = N'Identifier of the product being counted',
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
    @value = N'System‑recorded expected quantity for the product at the time of count',
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
    @value = N'Actual quantity counted by the user',
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
    @value = N'Variance between actual and expected quantities (act‑exp)',
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
    @value = N'This table stores purchase order header records, capturing each order placed with a supplier, its dates, status, total amount, shipping charge and optional notes.',
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
    @value = N'Identifier of the supplier for the order (likely foreign key to a Supplier table).',
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
    @value = N'Total monetary value of the purchase order.',
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
    @value = N'Flat shipping charge applied to the order (0 or 150).',
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
    @value = N'Optional free‑text notes; most rows are null, non‑null rows contain ''Expedited shipping requested''.',
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
    @value = N'Stores line‑item details for purchase orders, linking each PO (po_id) to a product (prd_id) with the ordered quantity, unit price and the quantity received.',
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
    @value = N'Identifier of the purchase order this line belongs to',
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
    @value = N'Line sequence number within the purchase order',
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
    @value = N'Identifier of the product being ordered',
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
    @value = N'Quantity ordered for the product',
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
    @value = N'Unit price of the product at the time of ordering',
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
    @value = N'Quantity of the product that has been received against the order line',
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
    @value = N'A product master table that stores detailed information about each item sold, including its unique identifier, category, supplier, SKU, name, description, pricing, cost, status, weight and unit of measure.',
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
    @value = N'Unique product identifier (primary key)',
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
    @value = N'Identifier of the product''s category (foreign key to a Category lookup table)',
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
    @value = N'Identifier of the product''s supplier (foreign key to a Supplier lookup table)',
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
    @value = N'Stock Keeping Unit code, a unique alphanumeric identifier used for inventory tracking',
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
    @value = N'Product name or title, often including variant information',
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
    @value = N'Short description or feature summary of the product',
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
    @value = N'Cost to acquire or produce the product (used for margin calculations)',
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
    @value = N'Current status of the product: A=Active, O=Out of stock, D=Discontinued',
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
    @value = N'Weight of the product, used for shipping calculations',
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
    @value = N'Unit of measure for inventory (EA=Each, BX=Box, CS=Case)',
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
    @value = N'This table records the receipt of goods against purchase orders, capturing when and where each shipment was received and any related notes (e.g., partial shipments). Each row represents a single receipt event linking a purchase order to a warehouse on a specific date.',
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
    @value = N'Unique identifier for each receipt transaction',
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
    @value = N'Identifier of the purchase order associated with the receipt',
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
    @value = N'Date the goods were received at the warehouse',
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
    @value = N'Identifier of the warehouse where the receipt occurred',
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
    @value = N'Optional free‑text comments about the receipt, often indicating partial shipments',
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
    @value = N'This table records the inventory status of each product at each warehouse, capturing on‑hand quantity, reserved quantity, reorder thresholds, and the dates of the last physical count and last receipt.',
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
    @value = N'Identifier of the product (stock keeping unit) for which inventory is tracked',
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
    @value = N'Identifier of the warehouse or storage location holding the product',
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
    @value = N'Current on‑hand quantity of the product at the warehouse',
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
    @value = N'Quantity of the product that is reserved or allocated to orders but not yet shipped',
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
    @value = N'Minimum desired stock level (reorder point) for the product at the warehouse',
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
    @value = N'Maximum desired stock level (upper safety stock) for the product at the warehouse',
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
    @value = N'Date of the most recent physical inventory count for the product at the warehouse',
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
    @value = N'Date of the most recent receipt (incoming shipment) of the product at the warehouse',
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
    @value = N'This table is a Supplier master list that stores core information about each supplier, including a unique supplier ID, supplier name, operational status, payment terms, rating, and primary contact details (name, phone, email). It supports procurement and vendor management processes by providing a reference for supplier selection, evaluation, and communication.',
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
    @value = N'Legal or trade name of the supplier company.',
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
    @value = N'Agreed payment terms for the supplier (e.g., Net 30, Net 60, COD).',
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
    @value = N'Supplier rating on a scale of 1 to 5, used for evaluation.',
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
    @value = N'A reference table that defines each warehouse or distribution center in the company''s logistics network, including its identifier, location, type, capacity and operational status.',
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
    @value = N'Surrogate primary key for the warehouse record.',
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
    @value = N'Short alphanumeric code identifying the warehouse (e.g., SEA, NYC).',
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
    @value = N'Full descriptive name of the warehouse or distribution center.',
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
    @value = N'City where the warehouse is located.',
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
    @value = N'Two‑letter state abbreviation for the warehouse location.',
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
    @value = N'Warehouse type: R = Regional hub, M = Main distribution, D = Depot.',
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
    @value = N'Maximum storage capacity of the warehouse (units).',
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
    @value = N'Operational status: A = Active, M = Maintenance/Closed.',
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
    @value = N'Stores mailing and location information for customers, including multiple address records per customer with type (shipping, billing, office) and a default flag to indicate the primary address.',
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
    @value = N'Unique identifier for each address record',
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
    @value = N'Identifier of the customer to whom the address belongs',
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
    @value = N'Type of address: S=Shipping, O=Office, B=Billing',
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
    @value = N'First line of the street address (street number and name)',
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
    @value = N'Second line of the address, usually suite or apartment number; optional',
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
    @value = N'Country code, always US',
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
    @value = N'Flag indicating whether this address is the customer''s default address',
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
    @value = N'Stores master information for each customer, including identification, name, status, creation date, acquisition source, assigned sales representative, market segment, rating, current balance, credit limit, and the date of the most recent order.',
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
    @value = N'Customer name, which may be an individual or a company.',
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
    @value = N'Current status of the customer (e.g., Active, Suspended, Inactive, Terminated).',
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
    @value = N'Source channel through which the customer was acquired (Web, Store, Referral, Phone).',
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
    @value = N'Market segment classification (Wholesale, Retail, Enterprise).',
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
    @value = N'Customer rating on a scale of 1 to 5, used for prioritization.',
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
    @value = N'Maximum credit limit approved for the customer.',
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
    @value = N'A log of customer interaction notes, recording each contact event (meeting, email, call, etc.) between a sales/ service representative and a specific customer on a given date.',
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
    @value = N'Primary key for the note entry; uniquely identifies each interaction record.',
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
    @value = N'Identifier of the customer associated with the note; likely a foreign key to a Customers table.',
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
    @value = N'Date of the interaction or when the note was recorded.',
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
    @value = N'Name of the employee or user who created the note.',
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
    @value = N'Free‑form text describing the content of the interaction (meeting summary, email details, etc.).',
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
    @value = N'Single‑character code indicating the interaction type: M=Meeting, E=Email, O=Other, C=Call/Contact.',
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
    @value = N'Stores email addresses associated with customers, including type (work, personal, other), verification status, and default flag. Acts as a linking table between customers and their multiple email records.',
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
    @value = N'Identifier of the customer to whom the email belongs',
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
    @value = N'Category of the email address (W=Work, P=Personal, O=Other)',
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
    @value = N'Flag indicating if this email is the default/primary address for the customer',
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
    @value = N'This table stores the line‑item details for each sales order, capturing which product was sold, the quantity, price, discount, tax and the line sequence within the order.',
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
    @value = N'Unique identifier for each order line item (order line item ID).',
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
    @value = N'Identifier of the parent order to which this line belongs (order ID).',
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
    @value = N'Identifier of the product being sold on this line (product ID).',
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
    @value = N'Unit price of the product at the time of the order (price).',
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
    @value = N'Discount amount applied to this line (discount).',
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
    @value = N'Tax amount calculated for this line (tax amount).',
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
    @value = N'Sequence number of the line within the order (line order).',
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
    @value = N'This table records individual sales orders, capturing the order identifier, customer reference, dates, status, monetary totals, shipping details, payment terms, and optional notes.',
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
    @value = N'Primary key for the order; uniquely identifies each sales transaction.',
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
    @value = N'Identifier of the customer who placed the order; links to a customer entity.',
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
    @value = N'Date when the order was created or placed.',
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
    @value = N'Date when the order was shipped; may be null for pending or unshipped orders.',
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
    @value = N'Current status of the order, using a single‑character code (e.g., D=Deleted, C=Cancelled, S=Shipped, P=Pending, X=Exception).',
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
    @value = N'Shipping charge for the order; limited to 0, 15, or 25.',
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
    @value = N'Discount percentage applied to the order; either 0% or 10%.',
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
    @value = N'Payment terms code (e.g., N30 = Net 30 days, N45 = Net 45 days, N60 = Net 60 days, COD = Cash on Delivery).',
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
    @value = N'Optional free‑text field for special instructions; currently only contains a standard ''Rush order - expedited shipping'' note.',
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
    @value = N'Stores phone contact information for customers, including phone number, type (home, work, mobile, fax), optional extension, and a flag indicating the default contact number.',
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
    @value = N'Identifier of the customer to whom the phone belongs',
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
    @value = N'The phone number string',
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
    @value = N'Phone extension number, applicable mainly to work phones',
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
    @value = N'Flag indicating if this is the customer''s default phone number',
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
    @value = N'Stores individual payment transactions linked to orders and customers, capturing when a payment was made, the amount, payment method, status, reference code and optional notes.',
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
    @value = N'Unique identifier for each payment record',
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
    @value = N'Identifier of the order associated with the payment (may be null)',
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
    @value = N'Identifier of the customer who made the payment',
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
    @value = N'Date the payment was received or processed',
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
    @value = N'Monetary amount of the payment',
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
    @value = N'Payment method code (WR=Wire, CA=Cash, CK=Check, CC=Credit Card)',
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
    @value = N'Current status of the payment (A=Approved, F=Failed, P=Pending, R=Refunded)',
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
    @value = N'External reference number for the payment, formatted as PMT‑YYYY‑#####',
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
    @value = N'Optional free‑text note, predominantly "Account credit applied"',
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
    @value = N'This table records product return transactions linked to original orders. Each row captures a unique return (rtn_id) together with the associated order (ord_id) and specific order line item (oli_id), the return date, reason, quantity, monetary amount, processing status, and optional notes describing the return circumstance.',
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
    @value = N'Primary identifier for the return record',
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
    @value = N'Identifier of the original order associated with the return',
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
    @value = N'Identifier of the specific order line item being returned',
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
    @value = N'Date the return was processed or received',
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
    @value = N'Reason code for the return (WRG=Wrong item, DOA=Dead on Arrival, DMG=Damaged, CHG=Customer changed mind)',
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
    @value = N'Quantity of items returned for the line item',
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
    @value = N'Monetary amount refunded or credited for the return',
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
    @value = N'Current processing status of the return (A=Approved, R=Rejected, P=Pending, C=Completed)',
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
    @value = N'Free‑text explanation or comment about the return',
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
    @value = N'This table records individual shipment events for orders, capturing which warehouse shipped the order, when it was shipped and (optionally) delivered, the carrier and tracking number used, shipment status, weight and shipping cost.',
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
    @value = N'Identifier of the order that is being shipped',
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
    @value = N'Warehouse code where the shipment originated',
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
    @value = N'Shipping carrier used for the shipment',
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
    @value = N'Carrier‑provided tracking number for the shipment',
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
    @value = N'Current status of the shipment (D=Delivered, N=Not shipped, S=Shipped, P=Pending)',
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
    @value = N'Weight of the shipment (units likely pounds or kilograms)',
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
    @value = N'Shipping cost tier applied to the shipment',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'shp',
    @level2type = N'COLUMN',
    @level2name = N'cost';
GO
