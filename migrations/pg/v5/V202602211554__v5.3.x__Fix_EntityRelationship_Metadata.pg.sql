-- ============================================================================
-- MemberJunction v5.0 PostgreSQL Baseline
-- Deterministically converted from SQL Server using TypeScript conversion pipeline
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


-- ===================== Helper Functions (fn*) =====================


-- ===================== Views =====================


-- ===================== Stored Procedures (sp*) =====================


-- ===================== Triggers =====================


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

-- Fix EntityRelationship records for MJ: Roles entity                                                                                                                                                                                                                                                                   
-- The RelatedEntityJoinField was incorrectly set to 'RoleName' (a display column)
-- instead of 'RoleID' (the FK column). This caused relationship queries to compare
-- a name column against a UUID primary key value, always returning zero results.
-- This was from some pre 2.0 metadata that was never cleaned up but found during the Postgres work
-- MJ: Authorization Roles                                                                                                                                                                                                                                                                                                
-- MJ: Entity Permissions                                        
-- MJ: Query Permissions                                                                                                                                                                                                                                                                                                  
-- MJ: User Roles 

UPDATE __mj."EntityRelationship"
SET "RelatedEntityJoinField" = 'RoleID'
WHERE "EntityID" = (
    SELECT "ID" FROM __mj."Entity" WHERE "Name" = 'MJ: Roles'
)
AND "RelatedEntityJoinField" = 'RoleName';


-- ===================== FK & CHECK Constraints =====================


-- ===================== Grants =====================


-- ===================== Comments =====================
