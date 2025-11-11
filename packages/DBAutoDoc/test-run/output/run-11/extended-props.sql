-- Database Documentation Script
-- Generated: 2025-11-09T03:30:52.252Z
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
    @value = N'Stores inventory adjustment transactions, recording changes to product quantities at specific warehouses on given dates, together with the reason for the adjustment, the user who performed it, and optional notes.',
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
    @value = N'Surrogate primary key uniquely identifying each inventory adjustment record.',
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
    @value = N'Identifier of the product whose inventory is being adjusted.',
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
    @value = N'Identifier of the warehouse/location where the adjustment took place.',
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
    @value = N'Date (and time) when the inventory adjustment was recorded.',
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
    @value = N'Quantity change applied to the product stock; positive values add stock, negative values remove stock.',
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
    @value = N'Reason code for the adjustment: STL (stolen/lost), EXP (expired), DAM (damaged), COR (correction).',
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
    @value = N'Name of the employee or system user who performed the adjustment.',
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
    @value = N'Free‑form description of the adjustment event, often mirroring the reason code.',
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
    @value = N'A hierarchical lookup table that defines product categories and sub‑categories for office‑related inventory items, including each category''s name, description, level in the hierarchy, ordering sequence, and its parent category reference.',
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
    @value = N'Identifier of the parent category; null or same as cat_id for top‑level categories',
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
    @value = N'Human‑readable name of the category (e.g., "Writing", "Computers")',
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
    @value = N'Longer description of the category’s purpose or contents',
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
    @value = N'Sequence number used to order categories within the same parent',
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
    @value = N'Stores inventory count transactions, recording the expected system quantity versus the actual counted quantity for each product in each warehouse on a specific date, along with the variance and the user who performed the count.',
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
    @value = N'Surrogate primary key uniquely identifying each inventory count record.',
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
    @value = N'Identifier of the warehouse where the inventory count was performed.',
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
    @value = N'Date on which the inventory count took place.',
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
    @value = N'Identifier of the product being counted.',
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
    @value = N'Quantity expected by the system before the physical count.',
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
    @value = N'Quantity actually counted during the inventory check.',
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
    @value = N'Variance between expected and actual quantities (exp_qty - act_qty).',
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
    @value = N'Name of the employee/user who performed the count.',
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
    @value = N'Stores purchase order records linking each order to a supplier, including order and expected delivery dates, status, total amount, shipping charge, and optional notes such as expedited shipping requests.',
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
    @value = N'Unique identifier for each purchase order.',
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
    @value = N'Identifier of the supplier associated with the purchase order.',
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
    @value = N'Date the purchase order was created or issued.',
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
    @value = N'Expected delivery or expiration date for the order.',
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
    @value = N'Current status of the purchase order, using a single‑character code (e.g., P=Pending, S=Shipped, R=Received, A=Approved, X=Cancelled).',
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
    @value = N'Shipping charge applied to the order; either 150 (charge applied) or 0 (no charge).',
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
    @value = N'Optional free‑text note; when present it records that expedited shipping was requested.',
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
    @value = N'This table stores purchase‑order line items, linking each purchase order (po_id) to the products being ordered (prd_id) with the ordered quantity, unit price and the quantity actually received. Each row represents one line on a purchase order and the seq column defines the line’s position within the order.',
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
    @value = N'Identifier of the purchase order this line belongs to; acts as a foreign key to the purchase‑order header table.',
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
    @value = N'Line sequence number within the purchase order, ranging from 1 to 7.',
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
    @value = N'Identifier of the product being ordered; foreign key to the product catalog.',
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
    @value = N'Unit price of the product for this order line (decimal).',
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
    @value = N'Quantity actually received for this line; may differ from qty due to partial deliveries.',
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
    @value = N'A product master table that stores detailed information about each item sold or stocked, including identifiers, category, supplier, SKU, name, description, pricing, cost, status, weight and unit of measure.',
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
    @value = N'Unique product identifier (primary key).',
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
    @value = N'Category identifier linking the product to a product category.',
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
    @value = N'Supplier identifier indicating which vendor provides the product.',
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
    @value = N'Product name or title, often including brand and model.',
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
    @value = N'Short marketing description of the product.',
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
    @value = N'Retail selling price of the product.',
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
    @value = N'Acquisition or wholesale cost of the product.',
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
    @value = N'Product status flag (e.g., A=Active, O=Out of stock, D=Discontinued).',
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
    @value = N'Weight of the product, expressed in the unit defined by uom.',
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
    @value = N'Unit of measure for the product (EA=Each, BX=Box, CS=Case).',
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
    @value = N'Stores records of goods receipts tied to purchase orders, capturing the receipt date, warehouse location, and any backorder notes for each partial shipment received.',
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
    @value = N'Date the goods were received',
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
    @value = N'Identifier of the warehouse where the receipt was recorded',
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
    @value = N'Free‑text comment indicating a partial shipment and remaining backorder',
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
    @value = N'Stores the inventory status of each product at each warehouse, including on‑hand quantity, reserved quantity, safety stock thresholds, and the dates of the last physical count and last receipt.',
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
    @value = N'Unique identifier of the product; links to the product master table.',
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
    @value = N'Identifier of the warehouse or storage location; links to a warehouse master table.',
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
    @value = N'Current on‑hand quantity of the product in the warehouse.',
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
    @value = N'Quantity of the product that is reserved for pending orders or allocations.',
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
    @value = N'Maximum allowable stock level (capacity or safety ceiling) for the product at the warehouse.',
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
    @value = N'This table is a Supplier master list that stores each supplier''s unique identifier, official name, current status, agreed payment terms, performance rating, and primary contact details (name, phone, email). It serves as a reference for procurement and accounts payable processes.',
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
    @value = N'Unique supplier identifier (primary key).',
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
    @value = N'Current status of the supplier (e.g., A=Active, T=Terminated, S=Suspended, I=Inactive).',
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
    @value = N'Payment terms agreed with the supplier (Net 30, Net 45, Net 60, Net 15, or Cash on Delivery).',
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
    @value = N'Supplier performance rating on a scale of 1 (lowest) to 5 (highest).',
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
    @value = N'This table is a reference list of company warehouse and distribution facilities. Each row stores the unique identifier, short code, full name, city, state, facility type, capacity and operational status of a warehouse or distribution center used for logistics and inventory management.',
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
    @value = N'Unique integer identifier for each warehouse record',
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
    @value = N'Three‑letter location code for the warehouse (e.g., NYC, LAX)',
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
    @value = N'Full descriptive name of the warehouse or distribution center',
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
    @value = N'Facility type code: R=Regional, M=Main, D=Distribution',
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
    @value = N'Capacity of the facility (e.g., square feet or units)',
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
    @value = N'Operational status: A=Active, M=Maintenance/Closed',
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
    @value = N'Stores mailing and location information for customers, with each row representing a distinct address linked to a customer. Includes address lines, city, state, zip, country, address type (shipping, billing, office) and a flag indicating the default address for the customer.',
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
    @value = N'Unique identifier for each address record.',
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
    @value = N'Identifier of the customer to which the address belongs.',
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
    @value = N'Address type code: S = Shipping, O = Office, B = Billing.',
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
    @value = N'First line of the street address (street number and name).',
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
    @value = N'Second address line, usually a suite or apartment number; optional (75% nulls).',
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
    @value = N'City name of the address.',
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
    @value = N'Two‑letter US state abbreviation.',
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
    @value = N'5‑digit US ZIP code.',
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
    @value = N'Country code, always ''US''.',
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
    @value = N'Flag indicating whether this address is the default for the customer (true = default).',
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
    @value = N'A customer master table storing core information about each client, including identification, name, status, acquisition details, assigned sales representative, market segment, rating, financial balances, credit limits and the date of the most recent order.',
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
    @value = N'Customer''s full name or business name',
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
    @value = N'Customer rating or credit score ranging from 1 (lowest) to 5 (highest)',
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
    @value = N'Date of the customer''s most recent order (nullable)',
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
    @value = N'A log of customer interaction notes, recording each contact event (meeting, email, call, etc.) with a customer, the date it occurred, the employee who made the entry, and the free‑text description of the discussion.',
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
    @value = N'Primary key for the interaction record; uniquely identifies each note entry.',
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
    @value = N'Identifier of the customer involved in the interaction; likely a foreign key to a Customer table.',
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
    @value = N'Name of the employee or system user who created the note.',
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
    @value = N'Free‑text description of what was discussed or the purpose of the contact.',
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
    @value = N'Single‑letter code indicating the interaction type (e.g., M=Meeting, E=Email, O=Other, C=Call).',
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
    @value = N'Stores each customer''s email addresses, including address type, verification status and whether it is the default contact email for the customer.',
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
    @value = N'Surrogate primary key for each email record',
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
    @value = N'Identifier of the customer to whom the email belongs (likely foreign key to a Customer table)',
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
    @value = N'Category of the email address – Work (W), Personal (P) or Other (O)',
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
    @value = N'Flag indicating whether this email is the customer''s default contact address',
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
    @value = N'Stores each line item of a sales order, capturing which product was sold, in what quantity, at what price, and the associated discount, tax and line sequence for a given order.',
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
    @value = N'Unique identifier for each order line item.',
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
    @value = N'Identifier of the parent sales order to which the line belongs.',
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
    @value = N'Identifier of the product being sold on the line.',
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
    @value = N'Discount amount applied to this line (absolute monetary value).',
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
    @value = N'Sequence number of the line within the order (1‑6).',
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
    @value = N'This table stores individual sales orders. Each row represents a single order placed by a customer, capturing when the order was created, when it was shipped (if applicable), its current status, monetary totals (order amount, tax, shipping charge, discount), payment terms, and any special notes such as rush handling.',
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
    @value = N'Unique identifier for each order (order number).',
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
    @value = N'Date the order was shipped; null when not yet shipped.',
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
    @value = N'Current status of the order (e.g., Draft, Confirmed, Shipped, Pending, Cancelled).',
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
    @value = N'Total order amount before tax, discount, and shipping.',
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
    @value = N'Flat shipping charge applied to the order (0, 15, or 25).',
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
    @value = N'Discount percentage applied to the order (0% or 10%).',
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
    @value = N'Payment terms for the order (e.g., Net 30, Net 45, Net 60, Cash on Delivery).',
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
    @value = N'Optional free‑text note; in this data set it indicates rush/expedited shipping.',
    @level0type = N'SCHEMA',
    @level0name = N'sales',
    @level1type = N'TABLE',
    @level1name = N'ord',
    @level2type = N'COLUMN',
    @level2name = N'notes';
GO




