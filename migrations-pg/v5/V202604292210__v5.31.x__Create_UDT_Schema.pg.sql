-- ============================================================================
-- MemberJunction PostgreSQL Migration
-- Converted from SQL Server using TypeScript conversion pipeline
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;

-- Ensure backslashes in string literals are treated literally (not as escape sequences)
SET standard_conforming_strings = on;

-- Implicit INTEGER -> BOOLEAN cast (SQL Server BIT columns accept 0/1 in INSERTs)
-- PostgreSQL has a built-in explicit-only INTEGER->bool cast. We upgrade it to implicit
-- so INSERT VALUES with 0/1 for BOOLEAN columns work like SQL Server BIT.
UPDATE pg_cast SET castcontext = 'i'
WHERE castsource = 'integer'::regtype AND casttarget = 'boolean'::regtype;


-- ===================== DDL: Tables, PKs, Indexes =====================

CREATE SCHEMA IF NOT EXISTS "__mj_UDT";

COMMENT ON SCHEMA "__mj_UDT" IS 'Schema for user-defined tables created through the MemberJunction Database Designer Agent. Tables here are created via natural language conversation and managed by the RuntimeSchemaManager pipeline.';


-- ===================== Other =====================

-- Migration: Create __mj_UDT schema for Database Designer Agent
-- User-Defined Tables (UDT) created through the Database Designer Agent live in this schema.
-- This separates UDT entities from the core __mj schema (which is always blocked by SchemaEngine)
-- and from customer application schemas (dbo, etc.), making it easy to audit what was AI-created.
