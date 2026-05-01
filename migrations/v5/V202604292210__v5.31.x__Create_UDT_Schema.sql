-- Migration: Create __mj_UDT schema for Database Designer Agent
-- User-Defined Tables (UDT) created through the Database Designer Agent live in this schema.
-- This separates UDT entities from the core __mj schema (which is always blocked by SchemaEngine)
-- and from customer application schemas (dbo, etc.), making it easy to audit what was AI-created.

IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = '__mj_UDT')
BEGIN
    EXEC('CREATE SCHEMA [__mj_UDT]')
END

-- Add description to schema for documentation
IF NOT EXISTS (
    SELECT 1 FROM sys.extended_properties
    WHERE class = 3  -- schema level
      AND major_id = SCHEMA_ID('__mj_UDT')
      AND name = N'MS_Description'
)
BEGIN
    EXEC sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'Schema for user-defined tables created through the MemberJunction Database Designer Agent. Tables here are created via natural language conversation and managed by the RuntimeSchemaManager pipeline.',
        @level0type = N'SCHEMA',
        @level0name = N'__mj_UDT'
END
