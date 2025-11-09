-- Database Documentation Script
-- Generated: 2025-11-09T03:10:18.234Z
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
    @value = N'This table records individual inventory adjustments. Each row captures a change in quantity for a specific product at a particular warehouse, the date of the adjustment, the reason (stock‑take, expiration, damage, correction), the user who performed it, and optional notes.',
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
    @value = N'Primary key for the adjustment record; uniquely identifies each inventory change event.',
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
    @value = N'Identifier of the product whose inventory is being adjusted; likely references a product catalog table.',
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
    @value = N'Identifier of the warehouse/location where the adjustment took place; likely references a warehouse table.',
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
    @value = N'Date (and time) when the adjustment was recorded.',
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
    @value = N'Quantity change; positive values add stock, negative values remove stock.',
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
    @value = N'Reason code for the adjustment: STL (stock‑take), EXP (expired), DAM (damaged), COR (correction).',
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
    @value = N'Name of the user/employee who performed the adjustment.',
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
    @value = N'Free‑text comment describing the adjustment; often repeats standard messages about expiration, damage, shrinkage, or count correction.',
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
    @value = N'A hierarchical lookup table that defines office‑related product categories and sub‑categories. Each row represents a distinct category (cat_id) with its name, description, level in the hierarchy, optional parent category (prnt_id), and a sequence order for display.',
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
    @value = N'Identifier of the parent category (self‑reference to cat_id) establishing hierarchy',
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
    @value = N'Short name of the category (e.g., "Writing", "Printers")',
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
    @value = N'Longer description of the category providing more detail',
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
    @value = N'Display order of the category within its parent group',
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
    @value = N'This table stores inventory count records for products in warehouses. Each row captures a single count event identified by cnt_id, the warehouse (whs_id) where the count took place, the date of the count (cnt_dt), the product counted (prd_id), the system‑expected quantity (exp_qty), the physically counted quantity (act_qty), the variance between expected and actual (var) and the user who performed the count (usr). It is used to reconcile stock levels, detect shrinkage, and support inventory audit processes.',
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
    @value = N'Surrogate primary key for each inventory count record',
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
    @value = N'Date on which the inventory count was taken',
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
    @value = N'System‑calculated expected quantity for the product in that warehouse on that date',
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
    @value = N'Physical quantity actually counted by the user',
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
    @value = N'Variance between expected and actual quantities (exp_qty‑act_qty) expressed as a small integer offset',
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
    @value = N'Name of the employee who performed the count',
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
    @value = N'Stores purchase order header records linking each order (po_id) to a supplier (sup_id) with order date, expected delivery date, status, total amount, shipping charge and optional expedited shipping note.',
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
    @value = N'Identifier of the supplier for the purchase order.',
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
    @value = N'Current status of the purchase order (e.g., Pending, Approved, Shipped, Received, Cancelled).',
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
    @value = N'Flat shipping charge applied to the order (150 when expedited, 0 otherwise).',
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
    @value = N'Optional free‑text note, currently used only for "Expedited shipping requested".',
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
    @value = N'Stores the line‑item details of purchase orders, linking each order (po_id) to a product (prd_id) with the ordered quantity, unit price and the quantity actually received.',
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
    @value = N'Identifier of the purchase order to which the line belongs.',
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
    @value = N'Sequence number of the line item within the purchase order (1‑7).',
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
    @value = N'Identifier of the product being ordered.',
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
    @value = N'Quantity of the product that has been received against the order line.',
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
    @value = N'This table is a product master catalog that stores detailed information about each sellable item, including its unique identifier, category, supplier, SKU, name, description, pricing, cost, status, weight and unit of measure.',
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
    @value = N'Primary key that uniquely identifies each product record',
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
    @value = N'Identifier of the product''s category (e.g., electronics, office supplies)',
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
    @value = N'Identifier of the supplier that provides the product',
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
    @value = N'Stock Keeping Unit code used for inventory tracking',
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
    @value = N'Human‑readable product name',
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
    @value = N'Short textual description of the product''s features',
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
    @value = N'Current status of the product (A=Active, O=Out of stock, D=Discontinued)',
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
    @value = N'Weight of the product in its base unit',
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
    @value = N'This table records individual receipt events of purchase orders at specific warehouses, capturing when (rcv_dt) each receipt occurred, which purchase order (po_id) it relates to, the unique receipt identifier (rcv_id), the warehouse location (whs_id), and any notes—most commonly indicating a partial shipment with remaining items on backorder.',
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
    @value = N'Free‑text comment about the receipt, currently indicating a partial shipment with remaining items on backorder',
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
    @value = N'Stores the inventory status of each product at each warehouse, including on‑hand quantity, reserved quantity, reorder thresholds, and the dates of the last physical count and last receipt.',
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
    @value = N'Identifier of the product; likely a foreign key to a Product master table.',
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
    @value = N'Identifier of the warehouse/location; likely a foreign key to a Warehouse master table.',
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
    @value = N'Minimum stock level threshold; used to trigger reorder alerts.',
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
    @value = N'Maximum desired stock level; used for inventory planning.',
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




-- Schema: sales










